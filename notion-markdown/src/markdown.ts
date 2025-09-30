import { Parser as HtmlParser } from 'htmlparser2'
import { unified, type Processor as MdProcessor } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type * as md from 'mdast'

const mdProcessor: MdProcessor<md.Root, undefined, md.Root | undefined> = unified().use(remarkParse).use(remarkGfm)

export function parseMarkdownDocument(content: string): md.RootContent[] {
  return mdProcessor.parse(content).children
}

/**
 * An HTML tag containing Markdown elements internally.
 */
export interface HtmlTag<T extends md.Node> {
  type: 'htmlTag'
  tag: string
  attrs: Record<string, string>
  children: (T | md.Html | HtmlTag<T>)[]
}

// Note that it is generally not type-safe
function isHtmlNode(node?: { type: string }): node is md.Html {
  return node?.type == 'html'
}

export function expandHtmlStructure<T extends md.Node>(nodes: (T | md.Html)[]): (T | md.Html | HtmlTag<T>)[] {
  const result: ReturnType<typeof expandHtmlStructure<T>> = []
  const containerTags: HtmlTag<T>[] = []
  const children = () => containerTags[0]?.children || result
  const completeContainerTag = (num: number) => {
    for (let i = 0; i < num; ++i) {
      const tag = containerTags.shift()
      if (tag) children().push(tag)
    }
  }

  const htmlParser = new HtmlParser({
    ontext: text => !/^\s*$/.test(text) && children().push({ type: 'html', value: text }),
    onopentag: (name, attrs) => containerTags.unshift({ type: 'htmlTag', tag: name, attrs, children: [] }),
    onclosetag: name => completeContainerTag(containerTags.findIndex(f => f.tag == name) + 1),
  })

  for (const node of nodes) {
    if (isHtmlNode(node)) {
      htmlParser.write(node.value)
    } else {
      children().push(node)
    }
  }

  htmlParser.end()
  completeContainerTag(containerTags.length)

  return result
}
