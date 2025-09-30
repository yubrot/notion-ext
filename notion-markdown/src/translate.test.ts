import { describe, it, expect } from 'vitest'
import { translate, type Context } from './translate.js'
import * as fb from '@yubrot/notion-flexible-blocks'

describe('translate', () => {
  const alert = (text: string, color: (fb.Block['data'] & { type: 'callout' })['callout']['color']) => {
    const co = fb.callout(fb.text(text), [])
    if (co.data.type == 'callout') co.data.callout = { ...co.data.callout, color }
    return co
  }

  const context: Partial<Context> = {
    mapLink: async url => {
      if (url == 'INVALID_EXAMPLE') return null
      try {
        url = new URL(url, 'https://example.com/').href
      } catch {
        return null
      }
      if (url == 'https://example.com/mention') return { mention: 'f2811268781747febb9689fe95dbe93d' }
      return url
    },
    mapImage: async url => {
      if (url == 'INVALID_EXAMPLE') return null
      try {
        url = new URL(url, 'https://example.com/').href
      } catch {
        return null
      }
      if (url == 'https://example.com/EMBED_EXAMPLE') {
        return { embed: 'https://example.com/embed' }
      }
      if (url == 'https://example.com/AUDIO_EXAMPLE') {
        return { type: 'audio', file: '604184d7-f31b-4961-99ca-67fff9764bb0' }
      }
      return url
    },
  }

  const testcases = [
    {
      title: 'headings and paragraphs',
      input: `
# Heading 1

paragraph 1

## Heading 2

paragraph 2

### Heading 3

paragraph 3

#### Heading 4

paragraph 4

paragraph 5
continues
      `,
      output: fb.toBlocks([
        fb.heading1(fb.text('Heading 1')),
        fb.paragraph(fb.text('paragraph 1')),
        fb.heading2(fb.text('Heading 2')),
        fb.paragraph(fb.text('paragraph 2')),
        fb.heading3(fb.text('Heading 3')),
        fb.paragraph(fb.text('paragraph 3')),
        fb.heading3(fb.text('Heading 4')),
        fb.paragraph(fb.text('paragraph 4')),
        fb.paragraph(fb.text('paragraph 5\ncontinues')),
      ]),
    },
    {
      title: 'thematic break',
      input: `
---
`,
      output: fb.toBlocks([fb.divider]),
    },
    {
      title: 'code block, blockquote',
      input: `
\`\`\`ts
// This is a code block
console.log('Hello, world!')
\`\`\`

> This is a blockquote
>
> blockquote continues
`,
      output: [
        fb.code("// This is a code block\nconsole.log('Hello, world!')", 'typescript'),
        fb.quote(fb.text('This is a blockquote'), [fb.paragraph(fb.text('blockquote continues'))]),
      ],
    },
    {
      title: 'lists',
      input: `
- foo
- bar
  - hoge
  - fuga \`piyo\`
    \`\`\`
    includes code block
    \`\`\`
    more paragraph
- baz

1. x
2. y
3. z

- [x] done
- [ ] todo
      `,
      output: fb.toBlocks([
        fb.bulletedListItem(fb.text('foo'), []),
        fb.bulletedListItem(fb.text('bar'), [
          fb.bulletedListItem(fb.text('hoge'), []),
          fb.bulletedListItem(
            [...fb.text('fuga '), ...fb.text('piyo', { code: true })],
            [fb.code('includes code block', 'plain text'), fb.paragraph(fb.text('more paragraph'))],
          ),
        ]),
        fb.bulletedListItem(fb.text('baz'), []),
        fb.numberedListItem(fb.text('x'), []),
        fb.numberedListItem(fb.text('y'), []),
        fb.numberedListItem(fb.text('z'), []),
        fb.toDo(true, fb.text('done'), []),
        fb.toDo(false, fb.text('todo'), []),
      ]),
    },
    {
      title: 'footnote',
      input: `
foo [^1] bar [^2] baz

[^1]: footnote one
[^2]: footnote _two_
      `,
      output: fb.toBlocks([
        ...fb.text('foo '),
        ...fb.text('^1', { code: true }),
        ...fb.text(' bar '),
        ...fb.text('^2', { code: true }),
        ...fb.text(' baz'),
        fb.paragraph([...fb.text('^1', { code: true }), ...fb.text(': '), ...fb.text('footnote one')]),
        fb.paragraph([
          ...fb.text('^2', { code: true }),
          ...fb.text(': '),
          ...fb.text('footnote '),
          ...fb.text('two', { italic: true }),
        ]),
      ]),
    },
    {
      title: 'link',
      input: `
[link1 *emphasis*](https://example.com/hello)
[link2](foo/bar)
[invalid link](INVALID_EXAMPLE)
**[mention](/mention)**
`,
      output: fb.toBlocks([
        ...fb.text('link1 ').map(b => fb.mapLink(b, () => 'https://example.com/hello')),
        ...fb.text('emphasis', { italic: true }).map(b => fb.mapLink(b, () => 'https://example.com/hello')),
        ...fb.newline,
        ...fb.text('link2').map(b => fb.mapLink(b, () => 'https://example.com/foo/bar')),
        ...fb.newline,
        ...fb.text('invalid link'),
        ...fb.newline,
        fb.mention('f2811268781747febb9689fe95dbe93d', { bold: true }),
      ]),
    },
    {
      title: 'media',
      input: `
![](https://example.com/image.png)
![](INVALID_EXAMPLE)
![](unsupported-filetype.ext)
![](./foo.png)
![](EMBED_EXAMPLE)
![](AUDIO_EXAMPLE)
      `,
      output: fb.toBlocks([
        ...fb.image({ external: { url: 'https://example.com/image.png' } }),
        ...fb.newline,
        ...fb.text('Invalid image: INVALID_EXAMPLE'),
        ...fb.newline,
        ...fb.text('Invalid image: unsupported-filetype.ext'),
        ...fb.newline,
        ...fb.image({ external: { url: 'https://example.com/foo.png' } }),
        ...fb.newline,
        ...fb.embed({ url: 'https://example.com/embed' }),
        ...fb.newline,
        ...fb.audio({ type: 'file_upload', file_upload: { id: '604184d7-f31b-4961-99ca-67fff9764bb0' } }),
      ]),
    },
    // TODO: testImageFetchable
    {
      title: 'text',
      input: `
Default _Italic_ **Bold** \`Code\` ~~Strikethrough~~  \nfoo
      `,
      output: fb.toBlocks([
        ...fb.text('Default '),
        ...fb.text('Italic', { italic: true }),
        ...fb.text(' '),
        ...fb.text('Bold', { bold: true }),
        ...fb.text(' '),
        ...fb.text('Code', { code: true }),
        ...fb.text(' '),
        ...fb.text('Strikethrough', { strikethrough: true }),
        ...fb.newline,
        ...fb.text('foo'),
      ]),
    },
    {
      title: 'html',
      input: `
<br>
<hr>
<img src="https://example.com/image.png" alt="example">
<iframe src="https://example.com"></iframe>
Inline <font size="15">foo</font> bar

<details>
<summary>toggle *title*</summary>

toggle **body 1**

toggle ~~body 2~~

</details>

<details>toggle2</details>

<details>
<summary>

toggle3 *title*

</summary>
<p>hello</p>
</details>
      `,
      output: fb.toBlocks([
        ...fb.newline,
        fb.divider,
        ...fb.image({
          external: { url: 'https://example.com/image.png' },
          caption: fb.text('example').map(i => i.data),
        }),
        ...fb.embed({ url: 'https://example.com' }),
        ...fb.text('\nInline '),
        ...fb.text('foo'), // default behavior of onUnsupportedHtmlTag
        ...fb.text(' bar'),
        fb.toggle(fb.text('toggle *title*'), [
          fb.paragraph([...fb.text('toggle '), ...fb.text('body 1', { bold: true })]),
          fb.paragraph([...fb.text('toggle '), ...fb.text('body 2', { strikethrough: true })]),
        ]),
        fb.toggle([], [fb.paragraph(fb.text('toggle2'))]),
        fb.toggle([...fb.text('toggle3 '), ...fb.text('title', { italic: true })], [fb.paragraph(fb.text('hello'))]),
      ]),
    },
    {
      title: 'mixed markdown with html',
      input: `
- <details><summary>toggle title</summary>
  <p>

  Here is **an example**

  </p>
- A <a href="https://www.notion.com/">Notion **link**</a>
      `,
      output: [
        fb.bulletedListItem(
          [],
          [
            fb.toggle(fb.text('toggle title'), [
              fb.paragraph([...fb.text('Here is '), ...fb.text('an example', { bold: true })]),
            ]),
          ],
        ),
        fb.bulletedListItem(
          [
            ...fb.text('A '),
            ...fb.text('Notion ').map(b => fb.mapLink(b, () => 'https://www.notion.com/')),
            ...fb.text('link', { bold: true }).map(b => fb.mapLink(b, () => 'https://www.notion.com/')),
          ],
          [],
        ),
      ],
    },
    {
      title: 'table',
      input: `
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
      `,
      output: fb.toBlocks([
        fb.table(3, [
          fb.tableRow([fb.text('Header 1'), fb.text('Header 2'), fb.text('Header 3')]),
          fb.tableRow([fb.text('Cell 1'), fb.text('Cell 2'), fb.text('Cell 3')]),
          fb.tableRow([fb.text('Cell 4'), fb.text('Cell 5'), fb.text('Cell 6')]),
        ]),
      ]),
    },
    {
      title: 'image in paragraph',
      input: `
foo ![](https://example.com/image.png) bar
      `,
      output: [
        fb.paragraph(fb.text('foo ')),
        ...fb.image({ external: { url: 'https://example.com/image.png' } }),
        fb.paragraph(fb.text(' bar')),
      ],
    },
    {
      title: 'image in table cells',
      input: `
| before | after |
|--------|-------|
| ![](https://example.com/before.png) | ![](https://example.com/after.png) |
      `,
      output: fb.toBlocks([
        fb.table(2, [
          fb.tableRow([fb.text('before'), fb.text('after')]),
          fb.tableRow([fb.text('*1', { code: true }), fb.text('*2', { code: true })]),
        ]),
        ...fb.image({
          external: { url: 'https://example.com/before.png' },
          caption: fb.text('*1', { code: true }).map(i => i.data),
        }),
        ...fb.image({
          external: { url: 'https://example.com/after.png' },
          caption: fb.text('*2', { code: true }).map(i => i.data),
        }),
      ]),
    },
    {
      title: 'GitHub alerts',
      input: `
> [!NOTE]
> Useful information that users should know, even when skimming content.

> [!TIP]
> Helpful advice for doing things better or more easily.

> [!IMPORTANT]
> Key information users need to know to achieve their goal.

> [!WARNING]
> Urgent info that needs immediate user attention to avoid problems.

> [!CAUTION]
> Advises about risks or negative outcomes of certain actions.
      `,
      output: fb.toBlocks([
        alert('Useful information that users should know, even when skimming content.', 'blue_background'),
        alert('Helpful advice for doing things better or more easily.', 'green_background'),
        alert('Key information users need to know to achieve their goal.', 'purple_background'),
        alert('Urgent info that needs immediate user attention to avoid problems.', 'brown_background'),
        alert('Advises about risks or negative outcomes of certain actions.', 'red_background'),
      ]),
    },
  ]

  for (const { title, input, output } of testcases) {
    it(title, async () => {
      const result = await translate(input, context)
      expect(result).toEqual(output)
    })
  }
})
