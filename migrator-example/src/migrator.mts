import PQueue from 'p-queue'
import { Client as NotionClient } from '@notionhq/client'
import { defaultRetryable, toPageUrl, type Retryable } from '@yubrot/notion-flexible-blocks'
import { create, type Context } from '@yubrot/notion-markdown'
import { PrismaClient, type SourcePageMigration } from './prisma/client/index.js'
import { Set as SourceSet } from './source/set.mjs'
import type * as src from './source/interface.mts'
import { PageIssuer } from './page-issuer.mjs'

export interface MigratorOptions {
  notion: NotionClient
  prisma: PrismaClient
  import?: boolean
  freeze?: boolean
  testImageFetchable?: boolean
  retryable?: Retryable
}

export class Migrator {
  readonly options: Required<MigratorOptions>
  readonly pageIssuer: PageIssuer
  readonly sources = new SourceSet()
  readonly rootPageIds: Record<string, string> = {} // source.id -> notion page id

  constructor(options: MigratorOptions) {
    this.options = {
      import: true,
      freeze: true,
      testImageFetchable: false,
      retryable: defaultRetryable,
      ...options,
    }
    this.pageIssuer = new PageIssuer(this.options.notion, this.prisma, this.options.retryable)
  }

  get prisma(): PrismaClient {
    return this.options.prisma
  }

  mount(source: src.Source, rootPageId: string) {
    this.sources.add(source)
    this.rootPageIds[source.id] = rootPageId
  }

  async migrate(targets: src.Page[] | src.Page | string[] | string) {
    if (Array.isArray(targets)) {
      for (const target of targets) await this.migrate(target)
    } else {
      const target = targets
      const url = typeof target == 'string' ? target : target.url
      try {
        const mg = await this.#migrate(target)
        if (mg.freezedAt) {
          await this.prisma.sourcePageMigrationError.deleteMany({ where: { url } })
        }
      } catch (e) {
        console.log(`[${url}] failed!`, e)
        await this.prisma.sourcePageMigrationError.create({ data: { url, message: `${e}` } })
      }
    }
  }

  async #migrate(page: src.Page | string, allocateOnly = false): Promise<SourcePageMigration> {
    const url = typeof page == 'string' ? page : page.url
    let mg = await this.prisma.sourcePageMigration.findUnique({ where: { url } })

    const needsImport = !allocateOnly && this.options.import && !mg?.importedAt
    const needsFreeze = !allocateOnly && this.options.freeze && !mg?.freezedAt
    if (mg && !needsImport && !needsFreeze) {
      console.log(`[${url}] nothing to do`)
      return mg
    }

    if (typeof page == 'string') {
      const fetched = await this.sources.page(url)
      if (!fetched) throw new Error(`Source page not found: ${url}`)
      if (fetched.url != url) throw new Error(`Source page url inconsistent: ${fetched.url} != ${url}`)
      page = fetched
    }
    console.log(`[${url}] migrate to: ${page.path.join('/')}`)

    // 1. allocate
    if (!mg) {
      console.log(`[${url}] allocating...`)
      ;[mg, page] = await this.#allocate(page)
      console.log(`[${url}] allocated: ${mg.notionPageId}`)
    } else {
      console.log(`[${url}] allocate skipped: ${mg.notionPageId}`)
    }

    // 2. import
    if (needsImport) {
      try {
        console.log(`[${url}] importing...`)
        await this.#import(mg, page)
        console.log(`[${url}] imported`)
      } catch (e) {
        console.log(`[${url}] import failed: ${e}`)
        await this.prisma.sourcePageMigrationError.create({ data: { url: page.url, message: `import failed: ${e}` } })
      }
    } else {
      console.log(`[${url}] import skipped`)
    }

    // 3. freeze
    if (needsFreeze && mg.importedAt) {
      try {
        console.log(`[${url}] freezing...`)
        await this.#freeze(mg, page)
        console.log(`[${url}] freezed`)
      } catch (e) {
        console.log(`[${url}] freeze failed: ${e}`)
        await this.prisma.sourcePageMigrationError.create({ data: { url: page.url, message: `freeze failed: ${e}` } })
      }
    } else {
      console.log(`[${url}] freeze skipped`)
    }

    return mg
  }

  async #allocate(page: src.Page): Promise<[SourcePageMigration, src.Page]> {
    const notionPageId = await this.pageIssuer.issue(this.rootPageIds[page.source.id], page.path)

    try {
      const data = { url: page.url, notionPageId }
      return [await this.prisma.sourcePageMigration.create({ data }), page]
    } catch (e) {
      let mg = await this.prisma.sourcePageMigration.findUnique({ where: { url: page.url } })
      // If mg exists, allocation on the same url, in other words, allocation on the same source page, is already done.
      // Notice that once the Notion page for the source page is fixed, the fixed Notion page takes precedence even if
      // the path of the source page is changed.
      if (mg) return [mg, page]

      mg = await this.prisma.sourcePageMigration.findFirst({ where: { notionPageId } })
      // If mg exists, allocation on the same Notion page is already done. This means that multiple source pages point
      // to the same path, so we try to fix the path.
      if (mg && page.fixPathConflict) {
        page = await page.fixPathConflict()
        return await this.#allocate(page)
      }

      throw new Error(`Failed to allocate page for ${page.url} to ${notionPageId}: ${e}`)
    }
  }

  async #import(mg: SourcePageMigration, page: src.Page) {
    if (mg.importedAt) return

    const contents = await page.contents()
    await create(this.options.notion, mg.notionPageId, contents, this.#importContext(page))

    mg.importedAt = new Date()
    await this.prisma.sourcePageMigration.update({
      where: { url: page.url },
      data: { importedAt: mg.importedAt },
    })
  }

  async #freeze(mg: SourcePageMigration, page: src.Page) {
    if (mg.freezedAt) return

    await page.freeze?.(toPageUrl(mg.notionPageId))

    mg.freezedAt = new Date()
    await this.prisma.sourcePageMigration.update({
      where: { url: page.url },
      data: { freezedAt: mg.freezedAt },
    })
  }

  #importContext(page: src.Page): Partial<Context & { retryable: Retryable }> {
    // #migrate is not designed to run in parallel, so we use PQueue to control it to be run in series.
    const pqueue = new PQueue({ concurrency: 1 })
    return {
      mapLink: async url => {
        try {
          url = new URL(url, page.url).href
        } catch {
          return null
        }

        const [source, ref] = this.sources.ref(url) || [null, null]
        if (!ref) return url

        switch (ref.type) {
          case 'page':
            return { mention: (await pqueue.add(() => this.#migrate(ref.url, true)))?.notionPageId || '' }
          case 'path':
            return { mention: await this.pageIssuer.issue(this.rootPageIds[source.id], ref.path) }
          case 'image':
          case 'embed':
            return ref.url
          default:
            throw new Error(ref satisfies never)
        }
      },
      mapImage: async url => {
        try {
          url = new URL(url, page.url).href
        } catch {
          return null
        }

        const [, ref] = this.sources.ref(url) || [null, null]
        if (!ref) return url

        switch (ref.type) {
          case 'page':
          case 'path':
            return null
          case 'image':
            return ref.url
          case 'embed':
            return { embed: ref.url }
          default:
            throw new Error(ref satisfies never)
        }
      },
      testImageFetchable: this.options.testImageFetchable,
      retryable: this.options.retryable,
    }
  }
}
