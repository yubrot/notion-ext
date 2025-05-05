import type { Client } from '@notionhq/client'
import * as fb from '@yubrot/notion-flexible-blocks'
import { translate, type Context } from './translate.js'

export { type Context } from './translate.js'
export { type Retryable } from '@yubrot/notion-flexible-blocks'

/**
 * Create blocks in Notion from a markdown document.
 * This function may involve multiple Notion API calls.
 * @param client - Notion client
 * @param rootBlockId - The page or block ID to create blocks
 * @param markdownDocument - Markdown document
 * @param ctx - a context that specifies detailed behavior
 */
export async function create(
  client: Client,
  rootBlockId: string,
  markdownDocument: string,
  ctx?: Partial<Context & { retryable?: fb.Retryable }>,
) {
  const { retryable, ...rest } = ctx ?? {}
  return await fb.create(client, rootBlockId, await translate(markdownDocument, rest), retryable ?? fb.defaultRetryable)
}
