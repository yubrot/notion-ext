import { type FlexibleBlock, toBlocks } from './flexible-block.js'
import { maximumDepthToExist, type Block, type NBlock0, type NBlock1 } from './block.js'

// See https://developers.notion.com/reference/request-limits
const MAX_BLOCKS_LENGTH = 100

export type ErrorHandler = (message: string) => never

const defaultErrorHandler: ErrorHandler = msg => {
  throw new Error(msg)
}

/**
 * Due to limitations of the Notion API, API calls must be split.
 * This type represents a plan for API calls that can be splitted and requestable.
 */
export type Plan = {
  path: number[]
  bors: NBlock0[]
}[]

/**
 * Build a plan for API calls from a list of FlexibleBlocks.
 */
export function plan(fbs: FlexibleBlock[], onError: ErrorHandler = defaultErrorHandler): Plan {
  return new Planner(onError).run(fbs)
}

class Planner {
  readonly plan: Plan
  readonly onError: ErrorHandler

  constructor(onError: ErrorHandler) {
    this.plan = []
    this.onError = onError
  }

  run(fbs: FlexibleBlock[]): Plan {
    const bors = this.visitEach(toBlocks(fbs), 0, [])
    if (bors) this.plan.unshift({ path: [], bors })
    this.plan.sort((a, b) => a.path.length - b.path.length)
    return this.plan
  }

  visitEach(blocks: Block[] | undefined, depth: number, path: number[]): NBlock0[] | undefined {
    if (!blocks?.length) return undefined

    // Simple greedy algorithm to split blocks (Notice that it may be not optimal)
    const allowedDepth = blocks.reduce((a, b) => Math.min(a, maximumDepthToExist(b)), 99)
    const bundlableSize = allowedDepth < depth ? 0 : MAX_BLOCKS_LENGTH
    const bundledBors: NBlock0[] = []
    const splittedBors: NBlock0[] = []

    for (const block of blocks) {
      const childPath = [...path, bundledBors.length + splittedBors.length]
      if (bundledBors.length < bundlableSize) {
        bundledBors.push(this.visit(block, depth, childPath))
      } else {
        splittedBors.push(this.visit(block, 0, childPath))
      }
    }
    for (let i = 0; i < splittedBors.length; i += MAX_BLOCKS_LENGTH) {
      this.plan.push({ path, bors: splittedBors.slice(i, i + MAX_BLOCKS_LENGTH) })
    }
    return bundledBors.length ? bundledBors : undefined
  }

  visit(block: Block, depth: number, path: number[]): NBlock0 {
    switch (block.data.type) {
      case 'embed':
      case 'bookmark':
      case 'image':
      case 'video':
      case 'pdf':
      case 'file':
      case 'audio':
      case 'code':
      case 'equation':
      case 'divider':
      case 'breadcrumb':
      case 'table_of_contents':
      case 'link_to_page':
      case 'heading_1':
      case 'heading_2':
      case 'heading_3':
      case 'paragraph':
      case 'table_row':
      case 'synced_block':
        if (block.children?.length) return this.onError(`${block.data.type} cannot have children`)
        return block.data
      case 'table': {
        const rows = this.visitEach(block.children, depth + 1, path) as NBlock1[]
        if (!testBlockTypes(rows, 'table_row')) return this.onError('Only table_row must appear under table')
        return { ...block.data, table: { ...block.data.table, children: rows } }
      }
      case 'column_list': {
        const columns = this.visitEach(block.children, depth + 1, path) as NBlock1[]
        if (!testBlockTypes(columns, 'column')) return this.onError('Only column must appear under column_list')
        return { ...block.data, column_list: { ...block.data.column_list, children: columns } }
      }
      case 'column':
      case 'quote':
      case 'bulleted_list_item':
      case 'numbered_list_item':
      case 'to_do':
      case 'toggle':
      case 'template':
      case 'callout': {
        const blocks = this.visitEach(block.children, depth + 1, path) as NBlock1[]
        // TypeScript cannot handle this so we need to use any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = block.data as any
        return { ...data, [data.type]: { ...data[data.type], children: blocks } }
      }
      case undefined:
        return this.onError('Block type unspecified')
      default:
        throw new Error(block.data satisfies never)
    }
  }
}

function testBlockTypes<T extends { type?: string }, K extends string>(
  blocks: T[],
  type: K,
): blocks is (T & { type: K })[] {
  return blocks.every(b => b.type == type)
}
