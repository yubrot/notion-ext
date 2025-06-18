import type { Client } from '@notionhq/client'
import { plan } from './plan.js'
import { execute } from './execute.js'
import type { FlexibleBlock } from './flexible-block.js'
import { defaultRetryable, type Retryable } from './util.js'

export {
  type Block,
  type TableRowBlock,
  type ColumnBlock,
  type MediaType,
  type MediaContent,
  embed,
  bookmark,
  getMediaType,
  media,
  image,
  video,
  pdf,
  audio,
  file,
  code,
  divider,
  table,
  tableRow,
  heading1,
  heading2,
  heading3,
  paragraph,
  space,
  bulletedListItem,
  numberedListItem,
  quote,
  toDo,
  toggle,
  callout,
} from './block.js'
export { type Inline, text, newline, mention } from './inline.js'
export {
  type FlexibleBlock,
  toBlocks,
  toInlines,
  removeHeadingParagraph,
  mapLink,
  mapCaption,
} from './flexible-block.js'
export { type Retryable, defaultRetryable, toPageUrl, toEmbeddableUrl } from './util.js'

/**
 * Create blocks in Notion from the FlexibleBlock list.
 * This function may involve multiple Notion API calls.
 * @param client - Notion client
 * @param rootBlockId - The page or block ID to create blocks
 * @param fbs - FlexibleBlock list
 * @param retryable - Retry Policy. See {@link defaultRetryable} implementation for details.
 */
export async function create(
  client: Client,
  rootBlockId: string,
  fbs: FlexibleBlock[],
  retryable: Retryable = defaultRetryable,
) {
  await execute(client, rootBlockId, plan(fbs), retryable)
}
