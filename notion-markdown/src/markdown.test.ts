import { describe, it, expect } from 'vitest'
import { parseMarkdownDocument, expandHtmlStructure, type HtmlTag } from './markdown.js'
import type { Node, Html } from 'mdast'

describe('expandHtmlStructure', () => {
  function expand<T extends Node>(nodes: (T | Html)[]): (T | Html | HtmlTag<T>)[] {
    const result = expandHtmlStructure(nodes)
    for (const node of result) {
      if ('position' in node) delete node.position // to focus the structure
      if ('children' in node && Array.isArray(node.children)) {
        node.children = expand(node.children as unknown as Node[]) as unknown as typeof node.children
      }
    }
    return result
  }

  const heading = <T extends unknown[]>(depth: number, ...children: T) => ({ type: 'heading', depth, children })
  const paragraph = <T extends unknown[]>(...children: T) => ({ type: 'paragraph', children })
  const list = <T extends unknown[]>(...children: T) => ({ type: 'list', children })
  const listItem = <T extends unknown[]>(...children: T) => ({ type: 'listItem', children })
  const text = (value: string) => ({ type: 'text', value })
  const emphasis = <T extends unknown[]>(...children: T) => ({ type: 'emphasis', children })
  const strong = <T extends unknown[]>(...children: T) => ({ type: 'strong', children })
  const html = (value: string) => ({ type: 'html', value })
  const htmlTag = <T extends unknown[]>(tag: string, attrs: Record<string, string>, ...children: T) => {
    return { type: 'htmlTag', tag, attrs, children }
  }

  const testcases = [
    {
      title: 'Empty',
      input: '',
      output: [],
    },
    {
      title: 'No HTML tags',
      input: `
# hello

world
      `,
      output: [heading(1, text('hello')), paragraph(text('world'))],
    },
    {
      title: 'HTML Blocks',
      input: `<div class="enhance">Hello</div>`,
      output: [htmlTag('div', { class: 'enhance' }, html('Hello'))],
    },
    {
      title: 'HTML Blocks inside markdown content',
      input: `- <div class="enhance">Hello</div>`,
      output: [list(listItem(htmlTag('div', { class: 'enhance' }, html('Hello'))))],
    },
    {
      title: 'HTML tags (treated as part of the paragraph)',
      input: `<span class="enhance">Hello</span>`,
      output: [paragraph(htmlTag('span', { class: 'enhance' }, text('Hello')))],
    },
    {
      title: 'HTML tags inside markdown content (treated as part of the paragraph of the list item)',
      input: `- <span class="enhance">Hello</span>`,
      output: [list(listItem(paragraph(htmlTag('span', { class: 'enhance' }, text('Hello')))))],
    },
    // https://spec.commonmark.org/0.31.2/#html-blocks (kind 6)
    {
      title: 'Code recognized as HTML Blocks',
      input: `<div>hello</div> foo`,
      output: [htmlTag('div', {}, html('hello')), html(' foo')],
    },
    // https://spec.commonmark.org/0.31.2/#html-blocks (kind 6)
    {
      title: 'Code recognized as HTML Blocks (closing)',
      input: `</div> foo`,
      output: [html(' foo')],
    },
    // https://spec.commonmark.org/0.31.2/#html-blocks (kind 7)
    {
      title: 'Code recognized as HTML Blocks (complete tag)',
      input: `<span>`,
      output: [htmlTag('span', {})],
    },
    {
      title: 'Code containing HTML tags',
      input: `foo <div>hello</div>`,
      output: [paragraph(text('foo '), htmlTag('div', {}, text('hello')))],
    },
    {
      title: 'Code containing HTML tags (closing)',
      input: `</span> foo`,
      output: [paragraph(text(' foo'))],
    },
    {
      title: 'A HTML Block containing markdown syntax',
      input: `<div>*hello*</div>`,
      output: [htmlTag('div', {}, html('*hello*'))],
    },
    {
      title: 'A HTML tag containing markdown syntax',
      input: `foo <span>*bar*</span> __baz__`,
      output: [paragraph(text('foo '), htmlTag('span', {}, emphasis(text('bar'))), text(' '), strong(text('baz')))],
    },
    {
      title: 'Base example for HTML Block spanning multiple blocks',
      input: `
<div> foo
bar</div> baz
`,
      output: [htmlTag('div', {}, html(' foo\nbar')), html(' baz')],
    },
    // Actually the closing </div> tag does not work properly.
    // At first it looks strange, but this structure is unavoidable under the CommonMark specification.
    // To make </div> work properly, we must follow the HTML blocks conditions appropriately:
    // https://spec.commonmark.org/0.31.2/#html-blocks
    {
      title: 'HTML Block spanning multiple markdown blocks (1)',
      input: `
<div> foo

bar</div> baz
`,
      output: [htmlTag('div', {}, html(' foo'), paragraph(text('bar'), text(' baz')))],
    },
    {
      title: 'HTML Block spanning multiple markdown blocks (2)',
      input: `
<div> foo
bar

</div> baz
`,
      output: [htmlTag('div', {}, html(' foo\nbar')), html(' baz')],
    },
    {
      title: 'HTML Block spanning multiple markdown blocks (3)',
      input: `
<div>

 foo
bar

</div> baz
`,
      output: [htmlTag('div', {}, paragraph(text('foo\nbar'))), html(' baz')],
    },
    {
      title: 'HTML Block spanning multiple markdown blocks (4)',
      input: `
<details><summary>title</summary>
<p>

Here is a *highlight.*

</p>
</details>
`,
      output: [
        htmlTag(
          'details',
          {},
          htmlTag('summary', {}, html('title')),
          htmlTag('p', {}, paragraph(text('Here is a '), emphasis(text('highlight.')))),
        ),
      ],
    },
    {
      title: 'Base example for HTML tag spanning multiple blocks',
      input: `
<span> foo
bar</span> baz
`,
      output: [paragraph(htmlTag('span', {}, text(' foo\nbar')), text(' baz'))],
    },
    // Actually the closing </span> tag does not work properly.
    // The closing </span> is automatically completed by the end of the paragraph.
    // To make </div> work properly, we must follow the HTML blocks conditions appropriately:
    // https://spec.commonmark.org/0.31.2/#html-blocks
    {
      title: 'HTML tag spanning multiple markdown blocks',
      input: `
<span> foo

bar</span> baz
`,
      output: [paragraph(htmlTag('span', {}, text(' foo'))), paragraph(text('bar'), text(' baz'))],
    },
  ]

  for (const { title, input, output } of testcases) {
    it(title, async () => {
      const result = expand(parseMarkdownDocument(input))
      expect(result).toMatchObject(output)
    })
  }
})
