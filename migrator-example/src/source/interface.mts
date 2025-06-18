/**
 * Interface to the source knowledge database to be migrated to Notion.
 */
export interface Source {
  id: string

  /**
   * Normalize an URL and determine what it refer to in the source.
   */
  ref(url: string): Ref | null

  /**
   * Iterate pages that match specific queries.
   */
  pages(options?: PagesQuery): Promise<PagesResult>

  /**
   * Retrieve the contents of a specific page.
   */
  page(url: string): Promise<Page | null>
}

export type Ref = PageRef | PathRef | EmbedRef

export interface PageRef {
  type: 'page'
  url: string
}

/**
 * A reference to a path (corresponding page is not determined or does not exist)
 */
export interface PathRef {
  type: 'path'
  path: Path
}

export interface EmbedRef {
  type: 'embed'
  url: string
  /**
   * Basically block type of the content will be inferred by the URL, but if this property is provided, the migrator
   * will prefer to use this block type instead of the one inferred by the URL.
   */
  preferredBlockType?: 'audio' | 'pdf' | 'image' | 'video' | 'file' | 'embed'
  /**
   * If provided, the migrator will attempt to download the content and upload it to Notion.
   */
  direct?(): Promise<{ content: Buffer; filename?: string } | null>
}

/**
 * The source pages are assumed to have a hierarchical structure, and a `Path` represents a location in that hierarchy.
 * For example, the child page “.bashrc” of the child page “yubrot” of the child page “Users” of the root is
 * represented as `[“Users”, “yubrot”, “.bashrc”]`.
 * Each `Path` corresponds to at most one `Page`.
 */
export type Path = string[]

export interface PagesQuery {
  cursor?: string
  pathStartsWith?: Path
  created?: { from?: Date; to?: Date }
}

export interface PagesResult {
  pages: Page[]
  nextCursor?: string
  totalCount?: number
}

/**
 * A representation of a single page on the source.
 * Every `Page` has a unique URL and also corresponds to a specific `Path` as described above.
 */
export interface Page {
  source: Source
  url: string
  path: Path

  /**
   * Read contents of the page as a markdown document.
   */
  contents(): Promise<string>

  /**
   * At most only one `Page` corresponds to a particular `Path`. Since it is difficult for the source implementation to
   * guarantee this at all times, `Page` can instead provide a method to “rewrite” the `Path`. If this method is
   * provided, when the Migrator founds a path conflict, it will use this method to obtain a new `Page` whose
   * `Path` has been rewritten. If this method is not provided, the source implementation must ensure that the `Path`
   * is unique.
   */
  fixPathConflict?(): Promise<Page>

  /**
   * By providing this method, the source `Page` can prevent further use after it has migrated by modifying and locking
   * the page.
   */
  freeze?(notionPageUrl: string): Promise<void>
}
