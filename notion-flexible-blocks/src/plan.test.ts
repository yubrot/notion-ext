import { describe, it, expect } from 'vitest'
import { plan } from './plan.js'
import { bulletedListItem } from './block.js'
import { text } from './inline.js'

describe('plan', () => {
  const node = bulletedListItem
  const matchNode = (text: string, children?: unknown[]) => ({
    bulleted_list_item: {
      rich_text: [{ text: { content: text } }],
      children,
    },
  })

  it('does not exceed block depth limit', () => {
    const fbs = [
      node(text('0'), [
        node(text('0-0'), [node(text('0-0-0')), node(text('0-0-1')), node(text('0-0-2'))]),
        node(text('0-1'), [
          node(text('0-1-0'), [node(text('0-1-0-0')), node(text('0-1-0-1'))]),
          node(text('0-1-1'), [node(text('0-1-1-0')), node(text('0-1-1-1'))]),
        ]),
      ]),
      node(text('1'), [
        node(text('1-0')),
        node(text('1-1'), [
          node(text('1-1-0'), [
            node(text('1-1-0+'), [
              node(text('1-1-0++'), [node(text('1-1-0+++'), [node(text('1-1-0++++'), [node(text('1-1-0+++++'))])])]),
            ]),
          ]),
        ]),
      ]),
    ]
    const result = plan(fbs)

    expect(result).toMatchObject([
      {
        path: [],
        bors: [
          matchNode('0', [
            matchNode('0-0', [matchNode('0-0-0'), matchNode('0-0-1'), matchNode('0-0-2')]),
            matchNode('0-1', [matchNode('0-1-0'), matchNode('0-1-1')]),
          ]),
          matchNode('1', [matchNode('1-0'), matchNode('1-1', [matchNode('1-1-0')])]),
        ],
      },
      {
        path: [0, 1, 0],
        bors: [matchNode('0-1-0-0'), matchNode('0-1-0-1')],
      },
      {
        path: [0, 1, 1],
        bors: [matchNode('0-1-1-0'), matchNode('0-1-1-1')],
      },
      {
        path: [1, 1, 0],
        bors: [matchNode('1-1-0+', [matchNode('1-1-0++', [matchNode('1-1-0+++')])])],
      },
      {
        path: [1, 1, 0, 0, 0, 0],
        bors: [matchNode('1-1-0++++', [matchNode('1-1-0+++++')])],
      },
    ])
  })

  it('does not exceed block length limit', () => {
    const fbs = new Array(150).fill(null).map((_, i) => {
      if (i == 3)
        return node(
          text('3'),
          new Array(150).fill(null).map((_, j) => node(text(`3-${j}`))),
        )
      return node(text(`${i}`))
    })
    const result = plan(fbs)

    expect(result).toMatchObject([
      {
        path: [],
        bors: new Array(100).fill(null).map((_, i) => {
          if (i == 3) {
            const children = new Array(100).fill(null).map((_, j) => matchNode(`3-${j}`))
            return matchNode('3', children)
          }
          return matchNode(`${i}`)
        }),
      },
      {
        path: [],
        bors: new Array(50).fill(null).map((_, i) => matchNode(`${i + 100}`)),
      },
      {
        path: [3],
        bors: new Array(50).fill(null).map((_, i) => matchNode(`3-${i + 100}`)),
      },
    ])
  })
})
