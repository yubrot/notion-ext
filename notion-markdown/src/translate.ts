import { AsyncLocalStorage } from 'node:async_hooks'
import type * as md from 'mdast'
import * as fb from '@yubrot/notion-flexible-blocks'
import { type HtmlTag, expandHtmlStructure as expandHtmlToFragments, parseMarkdownDocument } from './markdown.js'

export interface Context {
  /**
   * This callback is invoked when the translator finds a link; although Notion does not support the
   * concept of relative paths or other such concepts, you can map the path of a link to any URL or
   * mention to any page in Notion through this callback.
   */
  mapLink: (path: string) => Promise<MappedLink | null>

  /**
   * Image version of `mapLink`.
   * You can also map an image URL to any media content.
   */
  mapImage: (path: string) => Promise<MappedImage | null>

  /**
   * If true, the image will be tested for accessibility.
   */
  testImageFetchable: boolean

  onInvalidLink: (fbs: fb.FlexibleBlock[], url: string, t: Translator) => Promise<fb.FlexibleBlock[]>
  onInvalidMention: (fbs: fb.FlexibleBlock[], mention: string, t: Translator) => Promise<fb.FlexibleBlock[]>
  onInvalidImage: (url: string, t: Translator) => Promise<fb.FlexibleBlock[]>
  onInvalidEmbed: (url: string, t: Translator) => Promise<fb.FlexibleBlock[]>

  // You can override the behavior for unsupported nodes
  onUnsupportedYamlNode: (node: md.Yaml, t: Translator) => Promise<fb.Block[]>
  onUnsupportedDefinitionNode: (node: md.Definition, t: Translator) => Promise<fb.Block[]>
  onUnsupportedImageReferenceNode: (node: md.ImageReference, t: Translator) => Promise<fb.FlexibleBlock[]>
  onUnsupportedLinkReferenceNode: (node: md.LinkReference, t: Translator) => Promise<fb.FlexibleBlock[]>

  onHtmlTag: Record<string, HtmlTagTranslator>
  onUnsupportedHtmlTag: HtmlTagTranslator
}

export type MappedLink = string | { mention: string }

export type MappedImage =
  | string // Shorthand for { type: 'media'; url: string }
  | { type?: 'embed'; embed: string }
  | { type: 'media' | fb.MediaType; url: string; file?: undefined }
  | { type: 'media' | fb.MediaType; url?: undefined; file: string }

export type MarkdownContent =
  | md.RootContent
  | md.BlockContent
  | md.PhrasingContent
  | HtmlTag<md.RootContent | md.BlockContent | md.PhrasingContent>

export type HtmlTagTranslator = (src: HtmlTag<MarkdownContent>, t: Translator) => Promise<fb.FlexibleBlock[]>

/**
 * Translate a markdown document to Notion blocks.
 */
export async function translate(content: string, ctx?: Partial<Context>): Promise<fb.Block[]> {
  return await new Translator(ctx).document(content)
}

class Translator {
  private readonly ctx: Context
  private readonly asyncLocalStorage: AsyncLocalStorage<{ annotation?: fb.Inline['data']['annotations'] }>

  constructor(ctx?: Partial<Context>) {
    this.ctx = { ...defaultContext(), ...ctx }
    this.asyncLocalStorage = new AsyncLocalStorage()
  }

  get #annotation(): fb.Inline['data']['annotations'] | undefined {
    return this.asyncLocalStorage.getStore()?.annotation
  }

  #withAnnotation<T>(ann: fb.Inline['data']['annotations'], handler: () => Promise<T>): Promise<T> {
    const prev = this.asyncLocalStorage.getStore()
    const curr = { ...prev, annotation: { ...prev?.annotation, ...ann } }
    return this.asyncLocalStorage.run(curr, handler)
  }

  async document(content: string): Promise<fb.Block[]> {
    return fb.toBlocks(await this.contents(parseMarkdownDocument(content)))
  }

  async contents(src: MarkdownContent[]): Promise<fb.FlexibleBlock[]> {
    const fbss = await Promise.all(expandHtmlToFragments(src).map(c => this.#content(c)))
    return fbss.flat()
  }

  async #content(src: MarkdownContent): Promise<fb.FlexibleBlock[]> {
    switch (src.type) {
      case 'blockquote':
        return await this.#quote(src)
      case 'code':
        return [fb.code(src.value, src.lang?.split(':', 2)[0])]
      case 'definition':
        return await this.ctx.onUnsupportedDefinitionNode(src, this)
      case 'footnoteDefinition':
        return await this.#footnoteDefinition(src)
      case 'heading':
        return await this.#heading(src)
      case 'list':
        return await Promise.all(src.children.map(c => this.#listItem(c, src.ordered)))
      case 'listItem':
        return [await this.#listItem(src)]
      case 'paragraph':
        return fb.toBlocks(await this.contents(src.children))
      case 'thematicBreak':
        return [fb.divider]
      case 'table':
        return await this.#table(src)
      case 'tableRow':
      case 'tableCell':
        return []
      case 'text':
        return fb.text(src.value, this.#annotation)
      case 'emphasis':
        return await this.#withAnnotation({ italic: true }, () => this.contents(src.children))
      case 'strong':
        return await this.#withAnnotation({ bold: true }, () => this.contents(src.children))
      case 'delete':
        return await this.#withAnnotation({ strikethrough: true }, () => this.contents(src.children))
      case 'inlineCode':
        return fb.text(src.value, { ...this.#annotation, code: true })
      case 'break':
        return fb.newline
      case 'link':
        return await this.link(await this.contents(src.children), src.url)
      case 'image':
        return await this.image(src.url, { title: src.title || undefined })
      case 'footnoteReference':
        // Since there is no footnote in Notion, we use the text `^n` instead.
        return fb.text(`^${src.identifier}`, { code: true })
      case 'imageReference':
        return await this.ctx.onUnsupportedImageReferenceNode(src, this)
      case 'linkReference':
        return await this.ctx.onUnsupportedLinkReferenceNode(src, this)
      case 'html':
        // Since this.#content is always called from this.contents, HTML tags have already been removed from it
        return fb.text(src.value, this.#annotation)
      case 'htmlTag':
        return await this.#htmlTag(src)
      case 'yaml':
        return await this.ctx.onUnsupportedYamlNode(src, this)
      default:
        throw new Error(src satisfies never)
    }
  }

  async #quote(src: md.Blockquote): Promise<fb.Block[]> {
    const [inlines, blocks] = fb.removeHeadingParagraph(fb.toBlocks(await this.contents(src.children)))

    // Handle GitHub alerts as callouts
    if (inlines.length >= 1 && inlines[0].data.type == 'text') {
      for (const [prefix, style] of GITHUB_ALERT_PREFIX) {
        if (inlines[0].data.text.content.startsWith(prefix)) {
          inlines[0].data.text.content = inlines[0].data.text.content.slice(prefix.length)
          const co = fb.callout(inlines, blocks)
          if (co.data.type == 'callout') co.data.callout = { ...co.data.callout, ...style }
          return [co]
        }
      }
    }

    return [fb.quote(inlines, blocks)]
  }

  async #footnoteDefinition(src: md.FootnoteDefinition): Promise<fb.Block[]> {
    const [inlines, blocks] = fb.removeHeadingParagraph(fb.toBlocks(await this.contents(src.children)))

    return fb.toBlocks([
      fb.paragraph([...fb.text(`^${src.identifier}`, { code: true }), ...fb.text(': '), ...inlines]),
      ...blocks,
    ])
  }

  async #heading(src: md.Heading): Promise<fb.Block[]> {
    const [inlines, blocks] = fb.toInlines(await this.contents(src.children))
    switch (src.depth) {
      case 1:
        return [fb.heading1(inlines), ...blocks]
      case 2:
        return [fb.heading2(inlines), ...blocks]
      default:
        return [fb.heading3(inlines), ...blocks]
    }
  }

  async #listItem(src: md.ListItem, ordered?: boolean | null): Promise<fb.Block> {
    const args = fb.removeHeadingParagraph(fb.toBlocks(await this.contents(src.children)))

    if (typeof src.checked == 'boolean') return fb.toDo(src.checked, ...args)
    if (ordered) return fb.numberedListItem(...args)
    return fb.bulletedListItem(...args)
  }

  async #table(src: md.Table): Promise<fb.Block[]> {
    if (!src.children.length) return []

    const extraBlocks: fb.Block[] = []
    const width = src.children.reduce((max, row) => Math.max(max, row.children.length), 0)
    const rows = await Promise.all(src.children.map(c => this.#tableRow(c, extraBlocks, width)))
    const table = fb.table(width, rows)
    return [table, ...extraBlocks]
  }

  async #tableRow(src: md.TableRow, extraBlocks: fb.Block[], width: number): Promise<fb.TableRowBlock> {
    const cells = await Promise.all(src.children.map(c => this.#tableCell(c, extraBlocks)))
    while (cells.length < width) cells.push([])
    return fb.tableRow(cells)
  }

  async #tableCell(src: md.TableCell, extraBlocks: fb.Block[]): Promise<fb.Inline[]> {
    return fb.toInlines(await this.contents(src.children), extraBlocks)[0]
  }

  async link(fbs: fb.FlexibleBlock[], url: string): Promise<fb.FlexibleBlock[]> {
    const mappedLink = await this.ctx.mapLink(url)
    if (!mappedLink) return await this.ctx.onInvalidLink(fbs, url, this)
    if (isObject(mappedLink)) return await this.mention(fbs, mappedLink.mention)

    const embeddableUrl = fb.toEmbeddableUrl(mappedLink)
    if (!embeddableUrl) return await this.ctx.onInvalidLink(fbs, url, this)

    return fbs.map(b => fb.mapLink(b, () => embeddableUrl))
  }

  async mention(fbs: fb.FlexibleBlock[], mention: string): Promise<fb.FlexibleBlock[]> {
    if (!mention) return await this.ctx.onInvalidMention(fbs, mention, this)

    return [fb.mention(mention, this.#annotation)]
  }

  async image(url: string, options?: { title?: string; width?: number; height?: number }): Promise<fb.FlexibleBlock[]> {
    if (options?.title?.length) {
      // NOTE: Since current Notion API cannot specify width and height, we only use options.title
      const caption = fb.text(options.title)
      return (await this.image(url)).map(b => fb.mapCaption(b, () => caption))
    }

    let mappedImage = await this.ctx.mapImage(url)
    if (!mappedImage) return await this.ctx.onInvalidImage(url, this)
    if (!isObject(mappedImage)) mappedImage = { type: 'media', url: mappedImage }
    switch (mappedImage.type) {
      case undefined:
      case 'embed':
        return await this.embed(mappedImage.embed, options)
    }

    if (this.ctx.testImageFetchable && typeof mappedImage.url == 'string') {
      try {
        const response = await fetch(mappedImage.url, { method: 'HEAD' })
        if (!response.ok) throw 'Cannot fetch image'
      } catch {
        return await this.ctx.onInvalidImage(url, this)
      }
    }

    return await fb.media(
      typeof mappedImage.url == 'string'
        ? { type: 'external' as const, external: { url: mappedImage.url } }
        : { type: 'file_upload' as const, file_upload: { id: mappedImage.file } },
      mappedImage.type == 'media' ? undefined : mappedImage.type,
      () => this.ctx.onInvalidImage(url, this),
    )
  }

  async embed(url: string, options?: { title?: string; width?: number; height?: number }): Promise<fb.FlexibleBlock[]> {
    const embed = {
      url,
      // NOTE: Since current Notion API cannot specify width and height, we only use options.title
      caption: options?.title?.length ? fb.text(options.title).map(c => c.data) : undefined,
    }
    return await fb.embed(embed, () => this.ctx.onInvalidEmbed(url, this))
  }

  async #htmlTag(src: HtmlTag<MarkdownContent>): Promise<fb.FlexibleBlock[]> {
    const translator = this.ctx.onHtmlTag[src.tag] || this.ctx.onUnsupportedHtmlTag
    return await translator(src, this)
  }
}

export function defaultContext(): Context {
  return {
    mapLink: async url => url,
    mapImage: async url => url,
    testImageFetchable: false,
    onInvalidLink: async fbs => fbs,
    onInvalidMention: async fbs => fbs,
    onInvalidImage: async url => fb.text(`Invalid image: ${url}`),
    onInvalidEmbed: async url => fb.text(`Invalid embed: ${url}`),
    onUnsupportedYamlNode: async () => [],
    onUnsupportedDefinitionNode: async () => [],
    onUnsupportedImageReferenceNode: async () => [],
    onUnsupportedLinkReferenceNode: async () => [],

    onHtmlTag: defaultHtmlTagTranslators(),
    onUnsupportedHtmlTag: async (src, t) => await t.contents(src.children),
  }
}

export function defaultHtmlTagTranslators(): Record<string, HtmlTagTranslator> {
  const block: HtmlTagTranslator = async (src, t) => fb.toBlocks(await t.contents(src.children))

  return {
    br: async () => fb.newline,
    hr: async () => [fb.divider],
    a: async (src, t) => {
      const url = src.attrs.href || undefined
      if (!url) return await t.contents(src.children)

      return await t.link(await t.contents(src.children), url)
    },
    img: async (src, t) => {
      const url = src.attrs.src || undefined
      if (!url) return []

      const title = src.attrs.alt || undefined
      const width = src.attrs.width ? parseInt(src.attrs.width) : undefined
      const height = src.attrs.height ? parseInt(src.attrs.height) : undefined
      return await t.image(url, { title, width, height })
    },
    iframe: async (src, t) => {
      const url = src.attrs.src || undefined
      if (!url) return []

      const width = src.attrs.width ? parseInt(src.attrs.width) : undefined
      const height = src.attrs.height ? parseInt(src.attrs.height) : undefined
      return await t.embed(url, { width, height })
    },
    div: block,
    p: block,
    details: async (src, t) => {
      const maySummary = src.children[0]
      if (maySummary) {
        if (maySummary.type == 'htmlTag' && maySummary.tag == 'summary') {
          const [head, body] = fb.removeHeadingParagraph(fb.toBlocks(await t.contents(maySummary.children)))
          return [fb.toggle(head, [...body, ...fb.toBlocks(await t.contents(src.children.slice(1)))])]
        }
        return [fb.toggle([], fb.toBlocks(await t.contents(src.children)))]
      }
      return []
    },
  }
}

const GITHUB_ALERT_PREFIX: [string, Partial<(fb.Block['data'] & { type: 'callout' })['callout']>][] = [
  ['[!NOTE]\n', { color: 'blue_background' }],
  ['[!TIP]\n', { color: 'green_background' }],
  ['[!IMPORTANT]\n', { color: 'purple_background' }],
  ['[!WARNING]\n', { color: 'brown_background' }],
  ['[!CAUTION]\n', { color: 'red_background' }],
]

function isObject<T>(value: T | null): value is T & object {
  return !!value && typeof value == 'object'
}
