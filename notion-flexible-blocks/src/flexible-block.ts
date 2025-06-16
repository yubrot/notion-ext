import { type Block, paragraph } from './block.js'
import { type Inline, inline, text } from './inline.js'

// See https://developers.notion.com/reference/request-limits
const MAX_BLOCKS_LENGTH = 100

/**
 * FlexibleBlock is an abstract wrapper type for Notion's block type.
 * While we call it an abstract wrapper for blocks, this type can contain inline content, which will be combined later.
 */
export type FlexibleBlock = Block | Inline

/**
 * Convert `FlexibleBlock`s into an array of `Block`s.
 * Contiguous `Inline`s are combined as paragraphs to form a `Block`.
 */
export function toBlocks(fbs: FlexibleBlock[]): Block[] {
  const inlineBuf: Inline[] = []
  const ret: Block[] = []
  const chunk = () => {
    while (0 < inlineBuf.length) {
      ret.push(paragraph(inlineBuf.slice(0, MAX_BLOCKS_LENGTH)))
      inlineBuf.splice(0, MAX_BLOCKS_LENGTH)
    }
  }
  for (const fb of fbs) {
    if (fb.type == 'block') {
      chunk()
      ret.push(fb)
    } else {
      inlineBuf.push(fb)
    }
  }
  chunk()
  return ret
}

/**
 * Convert `FlexibleBlock`s into an array of `Inline`s.
 * When a `Block` is found, it cannot be converted to `Inline`, so this function inserts the reference string `*n`
 * there and add the `Block` to the `referencedBlocks`.
 */
export function toInlines(fbs: FlexibleBlock[], referencedBlocks: Block[] = []): [Inline[], Block[]] {
  const ret: Inline[] = []

  for (const fb of fbs) {
    if (fb.type == 'block') {
      const anchor = text(`*${referencedBlocks.length + 1}`, { code: true })
      ret.push(...anchor)
      referencedBlocks.push(
        mapCaption(fb, caption => (caption?.length ? [...anchor, ...text(' '), ...caption] : anchor)),
      )
    } else {
      ret.push(fb)
    }
  }
  return [ret, referencedBlocks]
}

/**
 * Remove the heading paragraph block and return its contents.
 * In Notion, everything is structured as blocks, each of which has its own contents and also has child blocks.
 * This function is used to extract the part of blocks that is its own content.
 * ```ts
 * const fbs = [
 *   text('foo'),
 *   text('bar'),
 *   bulletedListItem(text('baz')),
 *   bulletedListItem(text('qux')),
 * ]
 * bulletedListItem(...removeHeadingParagraph(toBlocks(fbs)))
 * // => bulletedListItem(
 * //   [text('foo'), text('bar')],
 * //   [bulletedListItem(text('baz')), bulletedListItem(text('qux'))],
 * // )
 * ```
 */
export function removeHeadingParagraph(fbs?: Block[]): [Inline[], Block[]] {
  if (!fbs?.length) return [[], []]
  if (fbs[0].data.type != 'paragraph') return [[], fbs]
  return [fbs[0].data.paragraph.rich_text.map(inline), fbs.slice(1)]
}

export function mapLink<T extends FlexibleBlock>(fb: T, handler: (url?: string) => string | undefined): T {
  if (fb.data.type != 'text') return fb
  return {
    ...fb,
    data: {
      ...fb.data,
      text: { ...fb.data.text, link: fb.data.text.link || { url: handler(fb.data.text.link || undefined) } },
    },
  }
}

export function mapCaption<T extends FlexibleBlock>(fb: T, handler: (data?: Inline[]) => Inline[] | undefined): T {
  const h = (data?: Inline['data'][]) => handler(data?.map(inline))?.map(i => i.data)
  const d = fb.data
  switch (d.type) {
    case 'image':
      return { ...fb, data: { ...d, image: { ...d.image, caption: h(d.image.caption) } } }
    case 'embed':
      return { ...fb, data: { ...d, embed: { ...d.embed, caption: h(d.embed.caption) } } }
    case 'video':
      return { ...fb, data: { ...d, video: { ...d.video, caption: h(d.video.caption) } } }
    case 'pdf':
      return { ...fb, data: { ...d, pdf: { ...d.pdf, caption: h(d.pdf.caption) } } }
    case 'audio':
      return { ...fb, data: { ...d, audio: { ...d.audio, caption: h(d.audio.caption) } } }
    case 'file':
      return { ...fb, data: { ...d, file: { ...d.file, caption: h(d.file.caption) } } }
    default:
      return fb
  }
}
