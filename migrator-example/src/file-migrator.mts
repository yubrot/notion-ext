import type { Client as NotionClient } from '@notionhq/client'
import { defaultRetryable, getMediaType, type Retryable } from '@yubrot/notion-flexible-blocks'
import type { PrismaClient } from './prisma/client/index.js'
import { randomUUID } from 'crypto'

export class FileMigrator {
  private readonly notion: NotionClient
  private readonly prisma: PrismaClient
  private readonly retryable: Retryable

  constructor(notion: NotionClient, prisma: PrismaClient, retryable: Retryable = defaultRetryable) {
    this.notion = notion
    this.prisma = prisma
    this.retryable = retryable
  }

  urlToFilename(url: string): string {
    const pathname = new URL(url).pathname
    const filename = pathname.split('/').slice(-1)[0]
    if (filename) return filename

    // fallback to random UUID with file extension
    return `${randomUUID()}.${url.split('?', 2)[0].split('.').slice(-1)[0].toLowerCase()}`
  }

  async migrate(url: string, filename: string, content: Buffer): Promise<string> {
    if (!filename || !getMediaType(filename)) {
      const message = `Unsupported file extension: ${filename}`
      await this.#recordError(url, message)
      throw new Error(message)
    }

    let lastError: unknown
    for (let i = 0; i < 5; ++i) {
      try {
        const existing = await this.prisma.sourceFileMigration.findFirst({ where: { url } })
        if (existing) return existing.notionFileId

        const fileId = await this.#upload(filename, content)
        await this.prisma.sourceFileMigration.create({ data: { url, notionFileId: fileId } })
        await this.prisma.sourceFileMigrationError.deleteMany({ where: { url } })
        return fileId
      } catch (error) {
        // Notion does not support removing files, maybe Notion will garbage collect them later
        lastError = error
        await this.#recordError(url, `${error}`)
        continue
      }
    }
    throw lastError
  }

  async #upload(filename: string, content: Buffer): Promise<string> {
    const PART_SIZE = 1024 * 1024 * 20 // 20 MB
    const parts = Math.ceil(content.length / PART_SIZE)
    const file = await this.retryable(() =>
      this.notion.fileUploads.create({
        mode: parts == 1 ? 'single_part' : 'multi_part',
        filename,
        number_of_parts: parts == 1 ? undefined : parts,
      }),
    )
    for (let i = 0; i < parts; ++i) {
      await this.retryable(() =>
        this.notion.fileUploads.send({
          file_upload_id: file.id,
          part_number: parts == 1 ? undefined : `${i + 1}`,
          file: {
            data: new Blob([parts == 1 ? content : content.subarray(i * PART_SIZE, (i + 1) * PART_SIZE)]),
          },
        }),
      )
    }
    await this.retryable(() => this.notion.fileUploads.complete({ file_upload_id: file.id }))
    return file.id
  }

  async #recordError(url: string, message: string): Promise<void> {
    for (let i = 0; i < 3; ++i) {
      try {
        await this.prisma.sourceFileMigrationError.create({ data: { url, message } })
      } catch {
        continue
      }
      return
    }
    console.log(`[${url}] record file migration error failed. skipping...`)
  }
}
