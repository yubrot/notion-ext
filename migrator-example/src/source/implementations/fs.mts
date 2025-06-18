import fs from 'fs'
import path from 'path'
import type * as src from '../interface.mts'

/**
 * An example implementation of `Source`. Markdown files on the file system are considered pages.
 */
export class FsSource implements src.Source {
  readonly id: string
  readonly baseUrl: string
  readonly rootDir: string

  /**
   * @param id - The ID of the source.
   * @param baseUrl - The (pseudo) base URL of the source.
   * @param rootDir - The root directory.
   */
  constructor(id: string, baseUrl: string, rootDir: string) {
    this.id = id
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.rootDir = path.resolve(rootDir.replace(/\/+$/, ''))
  }

  ref(url: string): src.Ref | null {
    if (!url.startsWith(this.baseUrl)) return null
    const srcPath = urlToSrcPath(url, this.baseUrl)
    const normalizedUrl = srcPathToUrl(srcPath, this.baseUrl)
    const { pageFile, nonPageFile } = srcPathToFilePath(srcPath, this.rootDir)
    if (fs.existsSync(pageFile) && fs.statSync(pageFile).isFile()) {
      return { type: 'page', url: normalizedUrl }
    }
    if (nonPageFile && fs.existsSync(nonPageFile)) {
      if (fs.statSync(nonPageFile).isDirectory()) return { type: 'path', path: srcPath }

      return {
        type: 'embed',
        url: normalizedUrl,
        direct: async () => ({ content: await fs.promises.readFile(nonPageFile) }),
      }
    }
    return null
  }

  async pages(options?: src.PagesQuery): Promise<src.PagesResult> {
    // NOTE: We don't support cursor or created option.
    if (options?.cursor || options?.created?.from || options?.created?.to) return { pages: [] }

    const dir = options?.pathStartsWith ? path.join(this.rootDir, ...options.pathStartsWith) : this.rootDir
    if (!dir.startsWith(this.rootDir)) return { pages: [] }

    const pages: src.Page[] = []
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true, recursive: true })
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue

        pages.push(this.#page(filePathToSrcPath(path.join(entry.parentPath, entry.name), this.rootDir)))
      }
    } catch {
      // do nothing
    }
    return { pages, totalCount: pages.length }
  }

  async page(url: string): Promise<src.Page | null> {
    if (!url.startsWith(this.baseUrl)) return null
    const srcPath = urlToSrcPath(url, this.baseUrl)
    const { pageFile } = srcPathToFilePath(srcPath, this.rootDir)
    if (fs.existsSync(pageFile) && fs.statSync(pageFile).isFile()) return this.#page(srcPath)
    return null
  }

  #page(srcPath: src.Path): src.Page {
    return {
      source: this,
      url: srcPathToUrl(srcPath, this.baseUrl),
      path: srcPath,
      contents: () => fs.promises.readFile(srcPathToFilePath(srcPath, this.rootDir).pageFile, 'utf-8'),
      // NOTE: We don't need fixPathConflict since file system satisfies the uniqueness of the path.
      freeze: notionPageUrl => {
        const message = `THIS PAGE HAS BEEN MIGRATED TO ${notionPageUrl}\n`
        return fs.promises.writeFile(srcPathToFilePath(srcPath, this.rootDir).pageFile, message)
      },
    }
  }
}

// We normalize the path to the following:
//
// | src.Path       | Page file path           | URL                |
// | -------------- | ------------------------ | ------------------ |
// | `[]`           | `<rootDir>/index.md`     | `<baseUrl>`        |
// | `["foo.md"]`   | `<rootDir>/foo.md`       | `<baseUrl>/foo.md` |
// | `["bar"]`      | `<rootDir>/bar/index.md` | `<baseUrl>/bar`    |
//
// src.Path containing `index.md` is not allowed.

function srcPathToUrl(srcPath: src.Path, baseUrl: string): string {
  return `${baseUrl}${srcPath.map(segment => `/${segment}`).join('')}`
}

function srcPathToFilePath(srcPath: src.Path, rootDir: string) {
  const p = path.join(rootDir, ...srcPath)
  if (srcPath.length && srcPath[srcPath.length - 1].endsWith('.md')) {
    return { pageFile: p, nonPageFile: null } // must be a page
  } else {
    return { pageFile: p + '/index.md', nonPageFile: p } // ambiguous; if page file exists, it is a page
  }
}

function urlToSrcPath(url: string, baseUrl: string): src.Path {
  return url
    .slice(baseUrl.length)
    .replace(/index.md$/, '')
    .split('/')
    .filter(Boolean)
}

function filePathToSrcPath(filePath: string, rootDir: string): src.Path {
  return filePath
    .slice(rootDir.length)
    .replace(/index.md$/, '')
    .split('/')
    .filter(Boolean)
}
