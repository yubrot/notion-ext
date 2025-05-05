import { describe, it, expect } from 'vitest'
import { embed, heading1, heading2, paragraph } from './block.js'
import { removeHeadingParagraph, toBlocks, toInlines } from './flexible-block.js'
import { text } from './inline.js'

describe('toBlocks', () => {
  it('converts inlines to paragraphs', () => {
    const inlinesA = [...text('A'), ...text('B')]
    const inlinesB = [...text('C'), ...text('D')]
    const fbs = [heading1(text('Hello')), ...inlinesA, heading2(text('World')), ...inlinesB]
    const result = toBlocks(fbs)
    expect(result).toEqual([heading1(text('Hello')), paragraph(inlinesA), heading2(text('World')), paragraph(inlinesB)])
  })

  // TODO: add MAX_BLOCKS_LENGTH test
})

describe('toInlines', () => {
  it('removes blocks and put anchor to blocks', () => {
    const fbs = [...text('Hello'), ...embed({ url: 'https://example.com' }), ...text('World')]
    const result = toInlines(fbs)
    expect(result).toEqual([
      [...text('Hello'), ...text('*1', { code: true }), ...text('World')],
      embed({ url: 'https://example.com', caption: text('*1', { code: true }).map(i => i.data) }),
    ])
  })
})

describe('removeHeadingParagraph', () => {
  it('removes the heading paragraph and returns the rest', () => {
    const block = [paragraph([...text('Hello'), ...text('World')]), paragraph(text('foo')), paragraph(text('bar'))]
    const result = removeHeadingParagraph(block)
    expect(result).toEqual([
      [...text('Hello'), ...text('World')],
      [paragraph(text('foo')), paragraph(text('bar'))],
    ])
  })

  it('removes nothing if there is no heading paragraph', () => {
    const block = [heading1(text('foo')), paragraph(text('bar'))]
    const result = removeHeadingParagraph(block)
    expect(result).toEqual([[], block])
  })
})
