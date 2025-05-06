import { Client as NotionClient } from '@notionhq/client'
import { PrismaClient } from './prisma/client/index.js'
import { LRUCache } from 'lru-cache'
import { defaultRetryable, type Retryable } from '@yubrot/notion-flexible-blocks'

export class PageIssuer {
  private readonly notion: NotionClient
  private readonly prisma: PrismaClient
  private readonly retryable: Retryable

  constructor(notion: NotionClient, prisma: PrismaClient, retryable: Retryable = defaultRetryable) {
    this.notion = notion
    this.prisma = prisma
    this.retryable = retryable
  }

  private readonly cache = new LRUCache<string, string>({ max: 1000 })

  async issue(pageId: string, path: string[]): Promise<string> {
    for (const name of path) {
      const parentPageId = pageId

      const cacheKey = `${parentPageId}:${name}`
      const cachedPageId = this.cache.get(cacheKey)
      if (cachedPageId) {
        pageId = cachedPageId
        continue
      }

      while (true) {
        // First, check for the existence of the page, if it does not exist, create a page in Notion, and then write
        // to the database to finalize the page; if DB write conflicts, retry to check the existing page again.
        let newPageId: string | undefined
        try {
          const existingPage = await this.prisma.notionPage.findFirst({ where: { parentPageId, name } })
          if (existingPage) {
            pageId = existingPage.pageId
            break
          }

          const newPage = await this.retryable(() =>
            this.notion.pages.create({
              parent: { page_id: parentPageId },
              properties: { type: 'title', title: [{ type: 'text', text: { content: name } }] },
            }),
          )
          newPageId = newPage.id
          await this.prisma.notionPage.create({ data: { pageId: newPageId, name, parentPageId } })
        } catch {
          if (newPageId) {
            const conflictedPageId = newPageId
            newPageId = undefined
            await this.retryable(() => this.notion.blocks.delete({ block_id: conflictedPageId }))
          }
          continue
        }
        pageId = newPageId
        break
      }

      this.cache.set(cacheKey, pageId)
    }
    return pageId
  }
}
