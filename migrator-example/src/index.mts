import { program } from 'commander'
import { PrismaClient } from './prisma/client/index.js'
import { toPageUrl } from '@yubrot/notion-flexible-blocks'

const prisma = new PrismaClient()

program
  .command('status')
  .description('Show the status of the migration')
  .action(async () => {
    console.log('Number of Notion pages:', await prisma.notionPage.count())
    console.log('Number of Source page migrations:', await prisma.sourcePageMigration.count())
    console.log('  - imported:', await prisma.sourcePageMigration.count({ where: { importedAt: { not: null } } }))
    console.log('  - freezed:', await prisma.sourcePageMigration.count({ where: { freezedAt: { not: null } } }))
    console.log('  - errors:', await prisma.sourcePageMigrationError.count())
  })

program
  .command('map')
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

await program.name('migrator').parseAsync(process.argv)
