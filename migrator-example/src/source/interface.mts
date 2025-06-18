import * as fb from '@yubrot/notion-flexible-blocks'

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

export type Ref =
  | { type: 'page'; url: string }
  | { type: 'path'; path: Path } // A reference to a path (corresponding page is not determined or does not exist)
  | { type: 'embed'; url: string } // A reference to the embedding content
  | {
      type: 'media' | fb.MediaType
      url: string
      /**
       * If provided, the migrator will attempt to download the content and upload it to Notion.
       */
      file?(): Promise<{ content: Buffer; name?: string } | null>
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
