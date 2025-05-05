import { unified, type Processor } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type * as md from 'mdast'
import { parse as parseHtml, Node as HtmlNode, type HTMLElement } from 'node-html-parser'
import * as fb from '@yubrot/notion-flexible-blocks'

export interface Context {
  /**
   * The processor for markdown.
   */
  mdProcessor: Processor<md.Root, undefined, md.Root | undefined>

  /**
   * Notion does not have the concept of relative paths. This option allows you to map to a URL.
   */
  mapLink: (path: string) => Promise<string | null>
  /**
   * This option allows you to map a link URL to a specific Notion page.
   */
  mapLinkToMention: (url: string) => Promise<string | null>
  /**
   * Called when `mapLink` or URL validation fails.
   */
  onInvalidLink: (fbs: fb.FlexibleBlock[], url: string) => Promise<fb.FlexibleBlock[]>

  /**
   * Image version of `mapLink`.
   */
  mapImage: (path: string) => Promise<string | null>
  /**
   * This option allows you to map an image URL to an embedding content.
   * Since Notion cannot directly embed images that require authentication, we may want to replace it with an embed.
   */
  mapImageToEmbed: (url: string) => Promise<string | null>
  /**
   * Called when `mapImage` or URL validation fails.
   */
  onInvalidImage: (url: string) => Promise<fb.FlexibleBlock[]>
  /**
   * If true, the image will be tested for accessibility.
   */
  testImageFetchable: boolean

  onInvalidEmbed: (url: string) => Promise<fb.FlexibleBlock[]>

  // You can override the behavior for unsupported nodes
  onUnsupportedYamlNode: (node: md.Yaml) => Promise<fb.Block[]>
  onUnsupportedDefinitionNode: (node: md.Definition) => Promise<fb.Block[]>
  onUnsupportedImageReferenceNode: (node: md.ImageReference) => Promise<fb.FlexibleBlock[]>
  onUnsupportedLinkReferenceNode: (node: md.LinkReference) => Promise<fb.FlexibleBlock[]>
  onUnsupportedHtmlNode: (node: HtmlNode, ann: fb.Inline['data']['annotations']) => Promise<fb.FlexibleBlock[]>
}

export const defaultContext: Context = {
  mdProcessor: unified().use(remarkParse).use(remarkGfm),
  mapLink: async url => url,
  mapLinkToMention: async url => {
    if (url.match(/^[a-z0-9]{32}$/)) return url
    return null
  },
  onInvalidLink: async fbs => fbs,
  mapImage: async url => url,
  mapImageToEmbed: async () => null,
  onInvalidImage: async url => fb.text(`Invalid image: ${url}`),
  testImageFetchable: false,
  onInvalidEmbed: async () => [],
  onUnsupportedYamlNode: async () => [],
  onUnsupportedDefinitionNode: async () => [],
  onUnsupportedImageReferenceNode: async () => [],
  onUnsupportedLinkReferenceNode: async () => [],
  onUnsupportedHtmlNode: async (node, ann) => fb.text(node.textContent, ann),
}

/**
 * Translate a markdown document to Notion blocks.
 */
export async function translate(content: string, ctx?: Partial<Context>): Promise<fb.Block[]> {
  return await new Translator(ctx).document(content)
}

class Translator {
  private readonly ctx: Context

  constructor(ctx?: Partial<Context>) {
    this.ctx = { ...defaultContext, ...ctx }
  }

  async document(content: string): Promise<fb.Block[]> {
    const rootContents = this.ctx.mdProcessor.parse(content).children
    const blocks = await Promise.all(rootContents.map(c => this.rootContent(c)))
    return blocks.flat()
  }

  async rootContent(src: md.RootContent): Promise<fb.Block[]> {
    switch (src.type) {
      case 'blockquote':
      case 'code':
      case 'definition':
      case 'footnoteDefinition':
      case 'heading':
      case 'list':
      case 'paragraph':
      case 'thematicBreak':
      case 'html':
      case 'table':
        return await this.blockContent(src)
      case 'break':
      case 'delete':
      case 'emphasis':
      case 'footnoteReference':
      case 'image':
      case 'imageReference':
      case 'inlineCode':
      case 'link':
      case 'linkReference':
      case 'strong':
      case 'text':
        return fb.toBlocks(await this.phrasingContent(src))
      case 'listItem':
        return [await this.listItem(src)]
      case 'tableRow':
      case 'tableCell':
        return []
      case 'yaml':
        return await this.ctx.onUnsupportedYamlNode(src)
      default:
        throw new Error(src satisfies never)
    }
  }

  async blockContent(src: md.BlockContent | md.DefinitionContent): Promise<fb.Block[]> {
    switch (src.type) {
      case 'blockquote':
        return await this.quote(src)
      case 'code':
        return [fb.code(src.value, src.lang?.split(':', 2)[0])]
      case 'definition':
        return await this.ctx.onUnsupportedDefinitionNode(src)
      case 'footnoteDefinition':
        return await this.footnoteDefinition(src)
      case 'heading': {
        const fbs = await Promise.all(src.children.map(c => this.phrasingContent(c)))
        const [inlines, blocks] = fb.toInlines(fbs.flat())
        switch (src.depth) {
          case 1:
            return [fb.heading1(inlines), ...blocks]
          case 2:
            return [fb.heading2(inlines), ...blocks]
          default:
            return [fb.heading3(inlines), ...blocks]
        }
      }
      case 'list':
        return await Promise.all(src.children.map(c => this.listItem(c, src.ordered)))
      case 'paragraph': {
        // Notice that a single `md.Paragraph` may result in multiple `fb.Block`s.
        const fbs = await Promise.all(src.children.map(c => this.phrasingContent(c)))
        return fb.toBlocks(fbs.flat())
      }
      case 'thematicBreak':
        return [fb.divider]
      case 'html':
        return fb.toBlocks(await this.html(src.value))
      case 'table':
        return await this.table(src)
      default:
        throw new Error(src satisfies never)
    }
  }

  async quote(src: md.Blockquote): Promise<fb.Block[]> {
    const blocks = await Promise.all(src.children.map(c => this.blockContent(c)))
    const [inlines, rest] = fb.removeHeadingParagraph(blocks.flat())

    // Handle GitHub alerts as callouts
    if (inlines.length >= 1 && inlines[0].data.type == 'text') {
      for (const [prefix, style] of GITHUB_ALERT_PREFIX) {
        if (inlines[0].data.text.content.startsWith(prefix)) {
          inlines[0].data.text.content = inlines[0].data.text.content.slice(prefix.length)
          const co = fb.callout(inlines, rest)
          if (co.data.type == 'callout') co.data.callout = { ...co.data.callout, ...style }
          return [co]
        }
      }
    }

    return [fb.quote(inlines, rest)]
  }

  async footnoteDefinition(src: md.FootnoteDefinition): Promise<fb.Block[]> {
    const blocks = await Promise.all(src.children.map(c => this.blockContent(c)))
    const [inlines, rest] = fb.removeHeadingParagraph(blocks.flat())
    return fb.toBlocks([
      fb.paragraph([...fb.text(`^${src.identifier}`, { code: true }), ...fb.text(': '), ...inlines]),
      ...rest,
    ])
  }

  async listItem(src: md.ListItem, ordered?: boolean | null): Promise<fb.Block> {
    const blocks = await Promise.all(src.children.map(c => this.blockContent(c)))
    const args = fb.removeHeadingParagraph(blocks.flat())
    if (typeof src.checked == 'boolean') return fb.toDo(src.checked, ...args)
    if (ordered) return fb.numberedListItem(...args)
    return fb.bulletedListItem(...args)
  }

  async table(src: md.Table): Promise<fb.Block[]> {
    if (!src.children.length) return []
    const extraBlocks: fb.Block[] = []
    const width = src.children.reduce((max, row) => Math.max(max, row.children.length), 0)
    const rows = await Promise.all(src.children.map(c => this.tableRow(c, extraBlocks, width)))
    const table = fb.table(width, rows)
    return [table, ...extraBlocks]
  }

  async tableRow(src: md.TableRow, extraBlocks: fb.Block[], width: number): Promise<fb.TableRowBlock> {
    const cells = await Promise.all(src.children.map(c => this.tableCell(c, extraBlocks)))
    while (cells.length < width) cells.push([])
    return fb.tableRow(cells)
  }

  async tableCell(src: md.TableCell, extraBlocks: fb.Block[]): Promise<fb.Inline[]> {
    const children = await Promise.all(src.children.map(c => this.phrasingContent(c)))
    return fb.toInlines(children.flat(), extraBlocks)[0]
  }

  // Since md.PhrasingContent does not always correspond to fb.Inline, this function should return fb.FlexibleBlock[]
  async phrasingContent(src: md.PhrasingContent, ann?: fb.Inline['data']['annotations']): Promise<fb.FlexibleBlock[]> {
    switch (src.type) {
      case 'text':
        return fb.text(src.value, ann)
      case 'emphasis': {
        ann = { italic: true, ...ann }
        const fbs = await Promise.all(src.children.map(c => this.phrasingContent(c, ann)))
        return fbs.flat()
      }
      case 'strong': {
        ann = { bold: true, ...ann }
        const fbs = await Promise.all(src.children.map(c => this.phrasingContent(c, ann)))
        return fbs.flat()
      }
      case 'delete': {
        ann = { strikethrough: true, ...ann }
        const fbs = await Promise.all(src.children.map(c => this.phrasingContent(c, ann)))
        return fbs.flat()
      }
      case 'inlineCode':
        ann = { code: true, ...ann }
        return fb.text(src.value, ann)
      case 'break':
        return fb.newline
      case 'link': {
        const fbs = await Promise.all(src.children.map(c => this.phrasingContent(c, ann)))
        return await this.link(fbs.flat(), src.url, ann)
      }
      case 'image':
        return await this.image(src.url, { title: src.title || undefined })
      case 'footnoteReference':
        // Since there is no footnote in Notion, we use the text `^n` instead.
        return fb.text(`^${src.identifier}`, { code: true })
      case 'html':
        return await this.html(src.value, ann)
      case 'imageReference':
        return await this.ctx.onUnsupportedImageReferenceNode(src)
      case 'linkReference':
        return await this.ctx.onUnsupportedLinkReferenceNode(src)
      default:
        throw new Error(src satisfies never)
    }
  }

  async link(
    fbs: fb.FlexibleBlock[],
    url: string,
    ann?: fb.Inline['data']['annotations'],
  ): Promise<fb.FlexibleBlock[]> {
    const urlBeforeMap = url
    url = (await this.ctx.mapLink(url)) || ''
    if (!url) return await this.ctx.onInvalidLink(fbs, urlBeforeMap)

    const pageId = await this.ctx.mapLinkToMention(url)
    if (pageId) return [fb.mention(pageId, ann)]

    url = fb.toEmbeddableUrl(url) || ''
    if (!url) return await this.ctx.onInvalidLink(fbs, urlBeforeMap)
    return fbs.map(b => fb.mapLink(b, () => url))
  }

  async image(url: string, options?: { title?: string; width?: number; height?: number }): Promise<fb.FlexibleBlock[]> {
    const urlBeforeMap = url
    url = (await this.ctx.mapImage(url)) || ''
    if (!url) return await this.ctx.onInvalidImage(urlBeforeMap)

    const embedUrl = await this.ctx.mapImageToEmbed(url)
    if (embedUrl) return await this.embed(embedUrl, options)

    if (this.ctx.testImageFetchable) {
      try {
        const response = await fetch(url, { method: 'HEAD' })
        if (!response.ok) throw 'Cannot fetch image'
      } catch {
        return await this.ctx.onInvalidImage(url)
      }
    }

    const image = {
      external: { url },
      // NOTE: Since current Notion API cannot specify width and height, we only use options.title
      caption: options?.title?.length ? fb.text(options.title).map(c => c.data) : undefined,
    }
    return await fb.image(image, () => this.ctx.onInvalidImage(url))
  }

  async embed(url: string, options?: { title?: string; width?: number; height?: number }): Promise<fb.FlexibleBlock[]> {
    const embed = {
      url,
      // NOTE: Since current Notion API cannot specify width and height, we only use options.title
      caption: options?.title?.length ? fb.text(options.title).map(c => c.data) : undefined,
    }
    return await fb.embed(embed, () => this.ctx.onInvalidEmbed(url))
  }

  async html(src: string, ann?: fb.Inline['data']['annotations']): Promise<fb.FlexibleBlock[]> {
    const nodes = await Promise.all(parseHtml(src).childNodes.map(n => this.htmlNode(n, ann)))
    return nodes.flat()
  }

  async htmlNode(src: HtmlNode, ann?: fb.Inline['data']['annotations']): Promise<fb.FlexibleBlock[]> {
    if (src.nodeType == 3) return fb.text(src.text, ann)

    switch (src.rawTagName.toLowerCase()) {
      case 'br':
        return fb.newline
      case 'hr':
        return [fb.divider]
      case 'img': {
        const attrs = (src as HTMLElement).attributes
        if (!attrs.src) return []

        const title = attrs.alt || undefined
        const width = attrs.width ? parseInt(attrs.width) : undefined
        const height = attrs.height ? parseInt(attrs.height) : undefined
        return await this.image(attrs.src, { title, width, height })
      }
      case 'iframe': {
        const attrs = (src as HTMLElement).attributes
        if (!attrs.src) return []

        const width = attrs.width ? parseInt(attrs.width) : undefined
        const height = attrs.height ? parseInt(attrs.height) : undefined
        return await this.embed(attrs.src, { width, height })
      }
      default:
        return await this.ctx.onUnsupportedHtmlNode(src, ann)
    }
  }
}

const GITHUB_ALERT_PREFIX: [string, Partial<(fb.Block['data'] & { type: 'callout' })['callout']>][] = [
  ['[!NOTE]\n', { color: 'blue_background' }],
  ['[!TIP]\n', { color: 'green_background' }],
  ['[!IMPORTANT]\n', { color: 'purple_background' }],
  ['[!WARNING]\n', { color: 'brown_background' }],
  ['[!CAUTION]\n', { color: 'red_background' }],
]
