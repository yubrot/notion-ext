import type { Page, PagesQuery, Ref, Source } from './interface.mts'

/**
 * Handle a set of sources.
 */
export class Set {
  private readonly sources: Record<string, Source> = {}

  get(id: string): Source {
    const source = this.sources[id]
    if (!source) throw new Error(`Unknown source ${id}`)
    return source
  }

  add(source: Source) {
    if (this.sources[source.id]) {
      throw new Error(`Duplicate source ${source.id}`)
    }
    this.sources[source.id] = source
  }

  ref(url: string): [Source, Ref] | null {
    for (const s of Object.values(this.sources)) {
      const r = s.ref(url)
      if (r) return [s, r]
    }
    return null
  }

  async *pages(id: string, options?: PagesQuery): AsyncGenerator<Page[], void> {
    const source = this.get(id)
    let cursor = undefined
    do {
      const result = await source.pages({ ...options, cursor })
      yield result.pages
      cursor = result.nextCursor
    } while (cursor)
  }

  async page(url: string): Promise<Page | null> {
    for (const source of Object.values(this.sources)) {
      const page = await source.page(url)
      if (page) return page
    }
    return null
  }
}
