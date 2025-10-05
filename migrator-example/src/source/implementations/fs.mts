import fs from 'fs'
import path from 'path'
import type * as src from '../interface.mts'

/**
 * An example implementation of `Source`. Markdown files on the file system are considered pages.
 */
export class FsSource implements src.Source {
  readonly id: string
  readonly baseUrl: string
  readonly rootDir: string
  /**
   * @param id - The ID of the source.
   * @param baseUrl - The (pseudo) base URL of the source.
   * @param rootDir - The root directory.
   */
  constructor(id: string, baseUrl: string, rootDir: string) {
    if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) throw 'rootDir does not exist'

    this.id = id
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.rootDir = path.resolve(rootDir.replace(/\/+$/, ''))
  }

  ref(url: string): src.Ref | null {
    const info = this.#urlToFilePathInfo(url)
    if (!info) return null

    if (info.stats.isDirectory()) return { type: 'path', path: info.components }
    if (info.stats.isFile()) {
      url = this.#filePathToUrl(info.path) // normalize

      if (info.components.at(-1)?.endsWith('.md')) return { type: 'page', url }

      return {
        type: 'media',
        url,
        file: async () => ({ content: await fs.promises.readFile(info.path) }),
      }
    }
    return null
  }

  async pages(options?: src.PagesQuery): Promise<src.PagesResult> {
    // NOTE: We don't support cursor or created option.
    if (options?.cursor || options?.created?.from || options?.created?.to) return { pages: [] }

    const dir = options?.pathStartsWith ? path.join(this.rootDir, ...options.pathStartsWith) : this.rootDir
    if (!dir.startsWith(this.rootDir)) return { pages: [] }

    const pages: src.Page[] = []
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true, recursive: true })
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue

        pages.push(this.#page(path.join(entry.parentPath, entry.name)))
      }
    } catch {
      // do nothing
    }
    return { pages, totalCount: pages.length }
  }

  async page(url: string): Promise<src.Page | null> {
    const info = this.#urlToFilePathInfo(url)
    if (!info || !info.stats.isFile() || !info.components.at(-1)?.endsWith('.md')) return null

    return this.#page(info.path)
  }

  #page(filePath: string): src.Page {
    let src: string
    if (filePath.endsWith('/index.md')) {
      // index.md is always omitted (When x/index.md exists, x is always a directory, so it can always be omitted)
      src = filePath.slice(this.rootDir.length, -'/index.md'.length)
    } else if (filePath.endsWith('.md') && !fs.existsSync(filePath.slice(0, -'.md'.length))) {
      // The .md extension at the end can be omitted if a file with that name without .md does not exist.
      src = filePath.slice(this.rootDir.length, -'.md'.length)
    } else {
      src = filePath.slice(this.rootDir.length)
    }

    return {
      source: this,
      url: this.#filePathToUrl(filePath),
      path: src.split('/').slice(1),
      contents: () => fs.promises.readFile(filePath, 'utf-8'),
      // NOTE: We don't need fixPathConflict since file system satisfies the uniqueness of the path.
      freeze: notionPageUrl => {
        const message = `THIS PAGE HAS BEEN MIGRATED TO ${notionPageUrl}\n`
        return fs.promises.writeFile(filePath, message)
      },
    }
  }

  // URL must always correspond to the actual file or directory path (No support for omitting .md extensions, etc)
  // -> The file corresponding to the URL can always be uniquely identified.
  // -> The URL is uniquely determined from the file path.

  #urlToFilePathInfo(url: string): {
    path: string
    stats: fs.Stats
    components: string[]
  } | null {
    if (!url.startsWith(this.baseUrl)) return null

    try {
      // ex.
      // url = 'https://github.com/yubrot/foo/hello%20world.md'
      // baseUrl = 'https://github.com/yubrot'
      // -> ['foo', 'hello world.md']
      const components = new URL(`https://example.com/${url.slice(this.baseUrl.length)}`).pathname
        .split(/\/+/)
        .filter(Boolean)
        .map(decodeURI)

      const filePath = path.join(this.rootDir, ...components)
      const stats = fs.statSync(filePath)
      return { path: filePath, stats, components }
    } catch {
      return null // new URL or fs.statAsync failed
    }
  }

  #filePathToUrl(filePath: string): string {
    return this.baseUrl + encodeURI(filePath.slice(this.rootDir.length))
  }
}
