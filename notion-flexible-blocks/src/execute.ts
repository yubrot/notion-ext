import { type Client } from '@notionhq/client'
import type { Plan } from './plan.js'
import { defaultRetryable, type Retryable } from './util.js'

/**
 * Create Notion blocks from a plan.
 */
export async function execute(
  client: Client,
  rootBlockId: string,
  plan: Plan,
  retryable: Retryable = defaultRetryable,
) {
  await new Executor(client, rootBlockId, retryable).execute(plan)
}

interface BlockNode {
  blockId: string
  children?: BlockNode[]
}

class Executor {
  private readonly client: Client
  private readonly retryable: Retryable
  private readonly rootBlock: BlockNode & { children: BlockNode[] }

  constructor(client: Client, rootBlockId: string, retryable: Retryable) {
    this.client = client
    this.retryable = retryable
    this.rootBlock = { blockId: rootBlockId, children: [] }
  }

  async execute(plan: Plan) {
    for (const { path, bors } of plan) {
      const blockId = await this.blockId(path)
      const { results } = await this.retryable(() =>
        this.client.blocks.children.append({ block_id: blockId, children: bors }),
      )

      // Blocks relations are usually retrieved on-demand except for the root block.
      if (path.length != 0) continue
      for (const { id } of results) this.rootBlock.children.push({ blockId: id })
    }
  }

  async blockId(path: number[]) {
    let current: BlockNode = this.rootBlock
    for (const index of path) {
      if (!current.children) {
        current.children = []
        let cursor: string | undefined
        do {
          const { results, next_cursor } = await this.retryable(() =>
            this.client.blocks.children.list({ block_id: current.blockId, start_cursor: cursor }),
          )
          for (const child of results) current.children.push({ blockId: child.id })
          cursor = next_cursor || undefined
        } while (cursor)
      }
      current = current.children[index]
    }
    return current.blockId
  }
}
