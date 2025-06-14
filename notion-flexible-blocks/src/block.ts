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
export type ColumnBlock = Block & { data: { type: 'column' } }

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
  return [block({ object: 'block', type: 'embed', embed: { ...embed, url } })]
}

export function bookmark<T = Block[]>(bookmark: BlockDetail<'bookmark'>, onError?: () => T): Block[] | T {
  const url = toEmbeddableUrl(bookmark.url)
  if (!url) return onError?.() || []
  return [block({ object: 'block', type: 'bookmark', bookmark: { ...bookmark, url } })]
}

export const supportedExtensions = (() => {
  const audio = 'aac adts mid midi mp3 mpga m4a m4b mp4 oga ogg wav wma'.split(' ')
  const pdf = 'pdf'.split(' ')
  const image = 'gif heic jpeg jpg png svg tif tiff webp ico'.split(' ')
  const video = 'amv asf wmv avi f4v flv gifv m4v mp4 mkv webm mov qt mpeg'.split(' ')
  const doc = 'txt json doc dot docx dotx xls xlt xla xlsx xltx ppt pot pps ppa pptx potx'.split(' ')
  const file = [...audio, ...pdf, ...image, ...video, ...doc]
  return { audio, pdf, image, video, file }
})()

export type MediaType = 'audio' | 'pdf' | 'image' | 'video' | 'file'

export type MediaContent = (NBlock2 & { type: 'image' })['image']

export function media<T = Block[]>(type: MediaType, media: MediaContent, onError?: () => T): Block[] | T {
  switch (type) {
    case 'audio':
      return audio(media, onError)
    case 'pdf':
      return pdf(media, onError)
    case 'image':
      return image(media, onError)
    case 'video':
      return video(media, onError)
    default:
      return file(media, onError)
  }
}

export function externalMedia<T = Block[]>(url: string, onError?: () => T): Block[] | T {
  const mediaType = getMediaTypeFromUrl(url)
  if (!mediaType) return onError?.() || []

  return media(mediaType, { type: 'external', external: { url } }, onError)
}

function getMediaTypeFromUrl(url: string): MediaType | null {
  const urlParts = url.split('?')[0].split('.')
  const extension = urlParts.pop()?.toLowerCase()
  if (!extension) return null

  if (supportedExtensions.image.includes(extension)) return 'image'
  if (supportedExtensions.video.includes(extension)) return 'video'
  if (supportedExtensions.audio.includes(extension)) return 'audio'
  if (supportedExtensions.pdf.includes(extension)) return 'pdf'
  if (supportedExtensions.file.includes(extension)) return 'file'

  return null
}

function normalizeMediaContent(content: MediaContent, extensions: string[]): MediaContent {
  if (!content.type && 'external' in content) content = { type: 'external', ...content }
  if (content.type == 'external') {
    const url = toEmbeddableUrl(content.external.url)
    if (!url) throw 'Cannot convert URL to embeddable'

    const urlParts = url.split('?', 2)[0].split('.')
    const extension = urlParts.pop()?.toLowerCase()
    if (!extension || !extensions.includes(extension)) throw 'Unsupported file extension'

    return { ...content, external: { ...content.external, url } }
  }
  return content
}

export function image<T = Block[]>(image: BlockDetail<'image'>, onError?: () => T): Block[] | T {
  try {
    return [block({ object: 'block', type: 'image', image: normalizeMediaContent(image, supportedExtensions.image) })]
  } catch {
    return onError?.() || []
  }
}

export function video<T = Block[]>(video: BlockDetail<'video'>, onError?: () => T): Block[] | T {
  try {
    return [block({ object: 'block', type: 'video', video: normalizeMediaContent(video, supportedExtensions.video) })]
  } catch {
    return onError?.() || []
  }
}

export function pdf<T = Block[]>(pdf: BlockDetail<'pdf'>, onError?: () => T): Block[] | T {
  try {
    return [block({ object: 'block', type: 'pdf', pdf: normalizeMediaContent(pdf, supportedExtensions.pdf) })]
  } catch {
    return onError?.() || []
  }
}

export function audio<T = Block[]>(audio: BlockDetail<'audio'>, onError?: () => T): Block[] | T {
  try {
    return [block({ object: 'block', type: 'audio', audio: normalizeMediaContent(audio, supportedExtensions.audio) })]
  } catch {
    return onError?.() || []
  }
}

export function file<T = Block[]>(file: BlockDetail<'file'>, onError?: () => T): Block[] | T {
  try {
    return [block({ object: 'block', type: 'file', file: normalizeMediaContent(file, supportedExtensions.file) })]
  } catch {
    return onError?.() || []
  }
}

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

export function columnList(columns: ColumnBlock[]): Block {
  return block({ object: 'block', type: 'column_list', column_list: {} }, columns)
}

export function column(children?: Block[]): ColumnBlock {
  return block({ object: 'block', type: 'column', column: {} }, children)
}

// TODO: type: 'synced_block'
