import type { BlockObjectRequestWithoutChildren } from '@notionhq/client/build/src/api-endpoints.js'
import type { BlockData, NBlock0, NBlock2 } from './block.js'
import { describe, it, expect } from 'vitest'
import {
  embed,
  bookmark,
  image,
  table,
  paragraph,
  columnList,
  column,
  maximumDepthToExist,
  externalMedia,
} from './block.js'
import { text } from './inline.js'

it.skip('static assertions', () => {
  // assert that BlockData contains all the types of NBlock0
  void ((x: NBlock0['type']) => x satisfies BlockData['type'])
  // assert that NBlock2 is compatible with BlockObjectRequestWithoutChildren
  void ((x: NBlock2) => x satisfies BlockObjectRequestWithoutChildren)
})

describe('maximumDepthToExist', () => {
  it('returns correct depth for different block types', () => {
    expect(maximumDepthToExist(columnList([]))).toBe(0)
    expect(maximumDepthToExist(table(2, []))).toBe(1)
    expect(maximumDepthToExist(column([]))).toBe(1)
    expect(maximumDepthToExist(paragraph(text('test')))).toBe(2)
  })
})

describe('media functions error handling', () => {
  it('handles invalid URL with onError callback', () => {
    const errorResult = { error: 'invalid' }
    expect(embed({ url: 'invalid-url' }, () => errorResult)).toBe(errorResult)
    expect(bookmark({ url: 'invalid-url' }, () => errorResult)).toBe(errorResult)
  })

  it('handles invalid file extension with onError callback', () => {
    const errorResult = ['error']
    const invalidContent = { type: 'external' as const, external: { url: 'https://example.com/file.txt' } }
    expect(image(invalidContent, () => errorResult)).toBe(errorResult)
  })

  it('returns empty array when no onError provided', () => {
    expect(embed({ url: 'invalid-url' })).toEqual([])
    expect(image({ type: 'external', external: { url: 'https://example.com/file.txt' } })).toEqual([])
  })
})

describe('externalMedia', () => {
  it('handles URLs without extension', () => {
    expect(externalMedia('https://example.com/noextension')).toEqual([])
  })

  it('handles unsupported extensions', () => {
    expect(externalMedia('https://example.com/file.xyz')).toEqual([])
  })

  it('detects image URLs correctly', () => {
    const result = externalMedia('https://example.com/photo.jpg')
    const expected = image({ type: 'external', external: { url: 'https://example.com/photo.jpg' } })
    expect(result).toHaveLength(1)
    expect(result).toEqual(expected)
  })

  it('handles uppercase extensions', () => {
    const result = externalMedia('https://example.com/PHOTO.JPG')
    const expected = image({ type: 'external', external: { url: 'https://example.com/PHOTO.JPG' } })
    expect(result).toHaveLength(1)
    expect(result).toEqual(expected)
  })
})
