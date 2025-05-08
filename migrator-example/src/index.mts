import { program } from 'commander'
import { Client as NotionClient } from '@notionhq/client'
import type { BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints.js'
import { toPageUrl } from '@yubrot/notion-flexible-blocks'
import { PrismaClient } from './prisma/client/index.js'
import { PageIssuer } from './page-issuer.mts'
import { Migrator } from './migrator.mts'
import { FsSource } from './source/implementations/fs.mts'

const prisma = new PrismaClient()

program.option('--notion-api-key <notionApiKey>', 'Notion API key. defaults to process.env.NOTION_API_KEY')

function notionClient(): NotionClient {
  const notionApiKey = program.opts().notionApiKey || process.env.NOTION_API_KEY
  if (!notionApiKey) {
    throw new Error('Either --notion-api-key of process.env.NOTION_API_KEY are required')
  }
  return new NotionClient({ auth: notionApiKey })
}

function migrator() {
  const mg = new Migrator({ notion: notionClient(), prisma })
  mg.mount(
    new FsSource(
      'example-docs',
      'https://github.com/yubrot/notion-ext/tree/main/migrator-example/example-docs',
      './example-docs',
    ),
    '1edb53d5-317a-80cb-96f9-f5eb72cb0a59',
  )
  return mg
}

program
  .command('migrate')
  .description('Migrate data from sources to Notion')
  .argument('<sourceIdOrSourcePageUrl>')
  .argument('[path...]')
  .option('-c, --cursor <cursor>', 'Cursor')
  .option('-f, --from <from>', 'Created from')
  .option('-t, --to <to>', 'Created to')
  .option('-p, --concurrency <concurrency>', 'Number of concurrent migrations', '1')
  .action(async (sourceIdOrSourcePageUrl, path, { cursor, from, to, concurrency }) => {
    const mg = migrator()
    const page = await mg.sources.page(sourceIdOrSourcePageUrl)
    if (page) {
      if (path.length > 0 || cursor || from || to) {
        throw new Error('Cannot use query options with page URL')
      }
      await mg.migrate(page)
    } else {
      const it = mg.sources.pages(sourceIdOrSourcePageUrl, {
        pathStartsWith: path,
        cursor,
        created: {
          from: from ? new Date(from) : undefined,
          to: to ? new Date(to) : undefined,
        },
      })
      await mg.migrateInConcurrent(it, Number(concurrency))
    }
  })

program
  .command('migrate:status')
  .description('Show the status of the migration')
  .action(async () => {
    console.log('Number of Notion pages:', await prisma.notionPage.count())
    console.log('Number of Source page migrations:', await prisma.sourcePageMigration.count())
    console.log('  - imported:', await prisma.sourcePageMigration.count({ where: { importedAt: { not: null } } }))
    console.log('  - freezed:', await prisma.sourcePageMigration.count({ where: { freezedAt: { not: null } } }))
    console.log('Number of Source page migration errors:', await prisma.sourcePageMigrationError.count())
  })

program
  .command('migrate:map')
  .description('Show the mapping of the source page URLs to the Notion page URLs')
  .action(async () => {
    const sourcePageMigrations = await prisma.sourcePageMigration.findMany({
      select: {
        notionPageId: true,
        url: true,
      },
    })
    const result: Record<string, string> = {}
    for (const entry of sourcePageMigrations) result[entry.url] = toPageUrl(entry.notionPageId)
    console.log(JSON.stringify(result, null, 2))
  })

program
  .command('notion:issue-page')
  .argument('<pageOrBlockId>')
  .argument('[path...]')
  .action(async (pageOrBlockId, path) => {
    const client = notionClient()
    const pageIssuer = new PageIssuer(client, prisma)
    const pageId = await pageIssuer.issue(pageOrBlockId, path)
    console.log(toPageUrl(pageId))
  })

program
  .command('notion:dump')
  .argument('<pageOrBlockId>')
  .action(async pageOrBlockId => {
    const client = notionClient()
    const root = await client.blocks.retrieve({ block_id: pageOrBlockId })
    const children: { id: string; type: string }[] = []

    let cursor: string | undefined
    do {
      const { results, next_cursor } = await client.blocks.children.list({
        block_id: pageOrBlockId,
        start_cursor: cursor,
      })
      for (const child of results) children.push({ id: child.id, type: (child as BlockObjectResponse).type })
      cursor = next_cursor || undefined
    } while (cursor)

    console.log('[root]')
    console.dir(root, { depth: 5 })
    console.log()
    console.log('[children]')
    for (const child of children) console.log(` - ${child.id} (${child.type})`)
  })

await program.name('migrator').parseAsync(process.argv)
