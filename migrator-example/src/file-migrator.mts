import { lookup } from 'mime-types'
import type { Client as NotionClient } from '@notionhq/client'
import { defaultRetryable, type Retryable } from '@yubrot/notion-flexible-blocks'
import type { PrismaClient } from './prisma/client/index.js'

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
    return pathname.split('/').slice(-1)[0]
  }

  async migrate(url: string, filename: string, content: Buffer): Promise<string> {
    let lastError: unknown
    for (let i = 0; i < 5; ++i) {
      try {
        const existing = await this.prisma.sourceFileMigration.findFirst({ where: { url } })
        if (existing) {
          console.log(`[${url}] file exists: ${existing.notionFileId}`)
          return existing.notionFileId
        }

        console.log(`[${url}] migrating...`)
        const fileId = await this.#upload(filename, content)
        await this.prisma.sourceFileMigration.create({ data: { url, notionFileId: fileId } })
        await this.prisma.sourceFileMigrationError.deleteMany({ where: { url } })
        console.log(`[${url}] migrate to file: ${fileId}`)
        return fileId
      } catch (error) {
        // Notion does not support removing files, maybe Notion will garbage collect them later
        lastError = error
        await this.#recordSourceFileMigrationError(url, `${error}`)
        continue
      }
    }
    throw lastError
  }

  async #upload(filename: string, content: Buffer): Promise<string> {
    const mimeType = lookup(filename)
    if (!mimeType) throw new Error(`unsupported file extension: ${filename}`)

    const PART_SIZE = 1024 * 1024 * 20 // 20 MB
    const parts = Math.ceil(content.length / PART_SIZE)

    const createRequest = {
      mode: parts == 1 ? 'single_part' : 'multi_part',
      filename,
      content_type: mimeType,
      number_of_parts: parts == 1 ? undefined : parts,
    } as const
    const file = await this.retryable(() => this.notion.fileUploads.create(createRequest))

    for (let i = 0; i < parts; ++i) {
      const subcontent = parts == 1 ? content : content.subarray(i * PART_SIZE, (i + 1) * PART_SIZE)
      const sendRequest = {
        file_upload_id: file.id,
        part_number: parts == 1 ? undefined : `${i + 1}`,
        file: { data: new Blob([subcontent], { type: mimeType }) },
      } as const
      await this.retryable(() => this.notion.fileUploads.send(sendRequest))
    }

    if (parts != 1) {
      await this.retryable(() => this.notion.fileUploads.complete({ file_upload_id: file.id }))
    }
    return file.id
  }

  async #recordSourceFileMigrationError(url: string, message: string): Promise<void> {
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
