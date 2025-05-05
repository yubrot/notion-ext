# `@yubrot/notion-flexible-blocks` package

A wrapper for the Notion Blocks API that provides a more developer-friendly interface to create Notion blocks.

This is internally used by [`@yubrot/notion-markdown`](https://github.com/yubrot/notion-ext/tree/main/notion-markdown).

## Usage

```bash
pnpm add @yubrot/notion-flexible-blocks
```

See [../notion-flexible-blocks-example](https://github.com/yubrot/notion-ext/tree/main/notion-flexible-blocks-example)

## Features

### Shorthands for common blocks

```ts
import { Client } from '@notionhq/client'
import { heading1, paragraph, text, create, bulletedListItem } from '@yubrot/notion-flexible-blocks'

const client = new Client({ auth: process.env.NOTION_API_KEY })
const rootBlockId = '...'

await create(client, rootBlockId, [
  heading1(text('Heading 1')),
  paragraph(text('Paragraph 1')),
  bulletedListItem(text('Item a'), [bulletedListItem(text('Item a.1')), bulletedListItem(text('Item a.2'))]),
  bulletedListItem(text('Item b')),
])
```

### Splitting API calls

This library automatically splits API calls to avoid exceeding the [Notion API Request limits](https://developers.notion.com/reference/request-limits).

```ts
import { Client } from '@notionhq/client'
import { paragraph, text, create, bulletedListItem } from '@yubrot/notion-flexible-blocks'

const client = new Client({ auth: process.env.NOTION_API_KEY })
const rootBlockId = '...'

await create(client, rootBlockId, [
  // More than 100 items are OK
  ...new Array(200).fill(null).map((_, i) => bulletedListItem(text(`Item ${i}`))),
  // More than 3 levels of nesting are OK
  bulletedListItem(text('depth=0'), [
    bulletedListItem(text('depth=1'), [bulletedListItem(text('depth=2'), [bulletedListItem(text('depth=3'))])]),
  ]),
])
```

### Layouts inline contents

You can keep a mixture of inline and block contents in a `FlexibleBlock[]` and convert it later to Notion blocks or Notion rich text.

```ts
const fbs = [
  ...text('foo '),
  ...image({ external: { url: 'https://example.com/image.png' } }), // Images are blocks!
  ...text(' bar'),
]
// ...

// (1) toBlocks
const blocks = toBlocks(fbs)

// (2) toInlines with tables
const [inlines, extraBlocks] = toInlines(fbs)
const blocks = [table(1, [tableRow([inlines])]), ...extraBlocks]
```

This difference can be seen in the following sample:

1. [toBlocks](https://plum-throne-667.notion.site/yubrot-notion-flexible-blocks-example-1e9b53d5317a800593a3de04458c65e5#1eab53d5317a81f0b0cbcd9d8c3ae1d1)
2. [toInlines with tables](https://plum-throne-667.notion.site/yubrot-notion-flexible-blocks-example-1e9b53d5317a800593a3de04458c65e5#1eab53d5317a81d0b361e49a0112218a)
