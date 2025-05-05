import type { BlockObjectRequestWithoutChildren } from '@notionhq/client/build/src/api-endpoints.js'

// See https://developers.notion.com/reference/request-limits
const MAX_CONTENT_LENGTH = 1000

/**
 * `Inline` is an abstract wrapper type for Notion's Rich text.
 * `Inline` is part of `FlexibleBlock`. See `FlexibleBlock` for more details.
 */
export interface Inline {
  type: 'inline'
  data: InlineData
}

export type InlineData = (BlockObjectRequestWithoutChildren & { type: 'paragraph' })['paragraph']['rich_text'][number]

// ---------------

export function inline<T extends InlineData>(data: T): Inline & { data: T } {
  return { type: 'inline', data }
}

export function text(content: string, annotations?: InlineData['annotations']): Inline[] {
  const ret: Inline[] = []
  for (let i = 0; i < content.length; i += MAX_CONTENT_LENGTH) {
    ret.push(
      inline({
        type: 'text',
        annotations,
        text: { content: content.slice(i, i + MAX_CONTENT_LENGTH) },
      }),
    )
  }
  return ret
}

export const newline: Inline[] = text('\n')

export function mention(pageId: string, annotations?: InlineData['annotations']): Inline {
  return inline({
    type: 'mention',
    mention: { page: { id: pageId } },
    annotations,
  })
}

// TODO: type: 'equation'
