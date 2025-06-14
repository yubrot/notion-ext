import { describe, it, expect } from 'vitest'
import { embed, heading1, heading2, paragraph, image } from './block.js'
import { removeHeadingParagraph, toBlocks, toInlines, mapCaption } from './flexible-block.js'
import { text } from './inline.js'

describe('toBlocks', () => {
  it('converts inlines to paragraphs', () => {
    const inlinesA = [...text('A'), ...text('B')]
    const inlinesB = [...text('C'), ...text('D')]
    const fbs = [heading1(text('Hello')), ...inlinesA, heading2(text('World')), ...inlinesB]
    const result = toBlocks(fbs)
    expect(result).toEqual([heading1(text('Hello')), paragraph(inlinesA), heading2(text('World')), paragraph(inlinesB)])
  })

  it('chunks large inline arrays', () => {
    // Create more than MAX_BLOCKS_LENGTH (100) inlines
    const manyInlines = Array.from({ length: 150 }, (_, i) => text(`text-${i}`)).flat()
    const result = toBlocks(manyInlines)
    expect(result).toHaveLength(2) // Should be split into 2 paragraphs
    expect(result[0].data.type).toBe('paragraph')
    expect(result[1].data.type).toBe('paragraph')
  })
})

describe('toInlines', () => {
  it('handles multiple blocks with anchors', () => {
    const fbs = [
      ...text('Start'),
      mapCaption(embed({ url: 'https://example.com' })[0], () => text('Caption')),
      ...text('Middle'),
      ...image({ type: 'external', external: { url: 'https://example.com/image.jpg' } }),
      ...text('End'),
    ]
    const result = toInlines(fbs)

    expect(result[0]).toEqual([
      ...text('Start'),
      ...text('*1', { code: true }),
      ...text('Middle'),
      ...text('*2', { code: true }),
      ...text('End'),
    ])
    expect(result[1]).toEqual([
      mapCaption(embed({ url: 'https://example.com' })[0], () => [
        ...text('*1', { code: true }),
        ...text(' '),
        ...text('Caption'),
      ]),
      mapCaption(image({ type: 'external', external: { url: 'https://example.com/image.jpg' } })[0], () =>
        text('*2', { code: true }),
      ),
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
