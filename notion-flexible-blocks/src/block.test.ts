import type { BlockObjectRequestWithoutChildren } from '@notionhq/client/build/src/api-endpoints.js'
import type { BlockData, NBlock0, NBlock2 } from './block.js'
import { it } from 'vitest'

it.skip('static assertions', () => {
  // assert that BlockData contains all the types of NBlock0
  void ((x: NBlock0['type']) => x satisfies BlockData['type'])
  // assert that NBlock2 is compatible with BlockObjectRequestWithoutChildren
  void ((x: NBlock2) => x satisfies BlockObjectRequestWithoutChildren)
})
