import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints.js'
import { type Inline, text } from './inline.js'
import { supportedLanguage, toEmbeddableUrl } from './util.js'

// Notion API limits the depth of blocks accepted by the API to 3, which are
// represented as different types. Define aliases for them.
export type NBlock0 = BlockObjectRequest
export type NBlock1 = NonNullable<(NBlock0 & { type: 'paragraph' })['paragraph']['children']>[number]
export type NBlock2 = NonNullable<(NBlock1 & { type: 'paragraph' })['paragraph']['children']>[number]

/**
 * `Block` is an abstract wrapper type for Notion's block type.
 * `Block` is part of `FlexibleBlock`. See `FlexibleBlock` for more details.
 * `Block` has no restrictions on the number of blocks or nesting depth due to Notion API Request Limits:
 * https://developers.notion.com/reference/request-limits
 */
export interface Block {
  type: 'block'
  data: BlockData
  children?: Block[]
}

export type BlockData =
  | NBlock2 // same as OmitChildren<NBlock0, 'embed'> | OmitChildren<NBlock0, 'bookmark'> | ...
  | OmitChildren<NBlock0, 'table'>
  | OmitChildren<NBlock0, 'column_list'>
  | OmitChildren<NBlock0, 'column'>

type OmitChildren<T, K extends string> = T extends { type?: K } & Record<K, unknown>
  ? Omit<T, K> & Record<K, Omit<T[K], 'children'>>
  : never

export type TableRowBlock = Block & { data: { type: 'table_row' } }

/**
 * The depth at which this Block is allowed to exist.
 */
export function maximumDepthToExist(block: Block): number {
  switch (block.data.type) {
    case 'column_list':
      return 0
    case 'table':
      return 1
    case 'column':
      return 1
    default:
      return 2
  }
}

// ---------------

export function block<T extends BlockData>(data: T, children?: Block[]): Block & { data: T } {
  return { type: 'block', data, children }
}

type BlockDetail<K extends string, T = BlockData> = T extends { type?: K } & Record<K, unknown> ? T[K] : never

export function embed<T = Block[]>(embed: BlockDetail<'embed'>, onError?: () => T): Block[] | T {
  const url = toEmbeddableUrl(embed.url)
  if (!url) return onError?.() || []
  return [block({ object: 'block', type: 'embed', embed: { ...embed, url } })] as T
}

export function bookmark<T = Block[]>(bookmark: BlockDetail<'bookmark'>, onError?: () => T): Block[] | T {
  const url = toEmbeddableUrl(bookmark.url)
  if (!url) return onError?.() || []
  return [block({ object: 'block', type: 'bookmark', bookmark: { ...bookmark, url } })] as T
}

const supportedImageExtensions = '.heic,.ico,.jpeg,.jpg,.png,.tif,.tiff,.gif,.svg,.webp'.split(',')

export function image<T = Block[]>(image: BlockDetail<'image'>, onError?: () => T): Block[] | T {
  const url = toEmbeddableUrl(image.external.url)
  if (!url) return onError?.() || []
  if (!supportedImageExtensions.some(ext => url.endsWith(ext))) return onError?.() || []
  return [block({ object: 'block', type: 'image', image: { ...image, external: { ...image.external, url } } })] as T
}

// TODO: type: 'video'
// TODO: type: 'pdf'
// TODO: type: 'file'
// TODO: type: 'audio'

export function code(code: string, lang?: string | null): Block {
  return block({
    object: 'block',
    type: 'code',
    code: {
      language: supportedLanguage(lang) || 'plain text',
      // FIXME: too much characters cause error
      rich_text: text(code).map(i => i.data),
    },
  })
}

// TODO: type: 'equation'

export const divider: Block = block({ object: 'block', type: 'divider', divider: {} })

// TODO: type: 'breadcrumb'
// TODO: type: 'table_of_contents'
// TODO: type: 'link_to_page'

export function table(width: number, children: TableRowBlock[]): Block {
  return block(
    {
      object: 'block',
      type: 'table',
      table: {
        table_width: width,
        has_column_header: true,
      },
    },
    children,
  )
}

export function tableRow(cells: Inline[][]): TableRowBlock {
  return block({
    object: 'block',
    type: 'table_row',
    table_row: { cells: cells.map(cell => cell.map(i => i.data)) },
  })
}

// NOTE: The type is supposed to take children, but Notion's UI does not, so
// this function does not take children as arguments.
export function heading1(children: Inline[]): Block {
  return block({ object: 'block', type: 'heading_1', heading_1: { rich_text: children.map(i => i.data) } })
}

// NOTE: ditto
export function heading2(children: Inline[]): Block {
  return block({ object: 'block', type: 'heading_2', heading_2: { rich_text: children.map(i => i.data) } })
}

// NOTE: ditto
export function heading3(children: Inline[]): Block {
  return block({ object: 'block', type: 'heading_3', heading_3: { rich_text: children.map(i => i.data) } })
}

export function paragraph(contents: Inline[], children?: Block[]): Block {
  return block({ object: 'block', type: 'paragraph', paragraph: { rich_text: contents.map(i => i.data) } }, children)
}

export const space: Block = paragraph([])

export function bulletedListItem(contents: Inline[], children?: Block[]): Block {
  return block(
    { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: contents.map(i => i.data) } },
    children,
  )
}

export function numberedListItem(contents: Inline[], children?: Block[]): Block {
  return block(
    { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: contents.map(i => i.data) } },
    children,
  )
}

export function quote(contents: Inline[], children?: Block[]): Block {
  return block({ object: 'block', type: 'quote', quote: { rich_text: contents.map(i => i.data) } }, children)
}

export function toDo(checked: boolean, contents: Inline[], children?: Block[]): Block {
  return block({ object: 'block', type: 'to_do', to_do: { rich_text: contents.map(i => i.data), checked } }, children)
}

export function toggle(contents: Inline[], children?: Block[]): Block {
  return block({ object: 'block', type: 'toggle', toggle: { rich_text: contents.map(i => i.data) } }, children)
}

// TODO: type: 'template'

export function callout(contents: Inline[], children?: Block[]): Block {
  return block({ object: 'block', type: 'callout', callout: { rich_text: contents.map(i => i.data) } }, children)
}

// TODO: type: 'synced_block'
