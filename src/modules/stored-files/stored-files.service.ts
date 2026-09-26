import { createHash, randomUUID } from 'node:crypto'

import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { StoredFile } from '@/generated/prisma/client'
import {
  ATTACHMENTS_CHANNEL,
  DRAFTS_FOLDER,
  EXPENSES_FOLDER,
  FILE_CLEANUP_BATCH,
  FILES_ROOT,
  FILE_URL_TTL_SECONDS,
  StoredFileStatus,
  TEMPORARY_FILE_DAYS,
} from '@/commons/constants/stored-file.constant'
import { StoredFileExpiredException } from '@/commons/exceptions/stored-file/stored-file-expired.exception'
import { StoredFileDBRepository } from '@/db/models/stored-file/storedFileDB.repository'
import { MediaFile } from '@/modules/expense-extraction/dto/expense-extraction.types'
import { OBJECT_STORAGE } from '@/providers/storage/storage.module'
import { ObjectStorage } from '@/providers/storage/storage.types'
import { StorageConfig } from '@/settings/settings.model'

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'application/pdf': '.pdf', // bank statements (P14)
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
}

// Screenshots and voice notes (D54, D58): R2 keeps the bytes, bot_files decides where they live.
// A file starts in <env>/finance/drafts/ and is deleted after 7 days, unless an expense that uses it is saved: then
// it moves to <env>/finance/expenses/. The database never stores the bytes.
@Injectable()
export class StoredFilesService {
  private readonly logger = new Logger(StoredFilesService.name)
  private readonly root: string // <env>/finance

  constructor(
    private readonly storedFileDBRepository: StoredFileDBRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    configService: ConfigService,
  ) {
    this.root = `${configService.getOrThrow<StorageConfig>('storage').env}/${FILES_ROOT}`
  }

  // Uploads to <env>/finance/drafts/ for 7 days. The same bytes already stored are reused (a temporary one gets its
  // 7 days again), so a screenshot sent twice is one object
  async storeTemporary(channel: string, data: Buffer, contentType: string): Promise<StoredFile> {
    const mimeType = contentType.split(';')[0]
    const sha256 = createHash('sha256').update(data).digest('hex')
    const expiresAt = new Date(Date.now() + TEMPORARY_FILE_DAYS * 24 * 60 * 60_000)

    const existing = await this.storedFileDBRepository.findAliveBySha256(sha256)
    if (existing?.status === StoredFileStatus.KEPT) return existing
    if (existing) return this.storedFileDBRepository.extendExpiry(existing.id, expiresAt)

    const month = new Date().toISOString().slice(0, 7)
    const storageKey = `${this.root}/${DRAFTS_FOLDER}/${month}/${randomUUID()}${EXTENSION_BY_MIME[mimeType] ?? ''}`
    await this.storage.put(storageKey, data, mimeType)
    return this.storedFileDBRepository.create({
      channel,
      storageKey,
      contentType: mimeType,
      sizeBytes: data.length,
      sha256,
      expiresAt,
    })
  }

  // A file attached to a loan, an investment or an expense (P27, D100): <env>/finance/<folder>/<yyyy>/<mm>/…, kept
  // (never expires). Every attachment is its own object: deleting one never touches another record's file
  async storeAttachment(folder: string, data: Buffer, contentType: string): Promise<StoredFile> {
    const mimeType = contentType.split(';')[0]
    const [year, month] = new Date().toISOString().slice(0, 7).split('-')
    const storageKey = `${this.root}/${folder}/${year}/${month}/${randomUUID()}${EXTENSION_BY_MIME[mimeType] ?? ''}`
    await this.storage.put(storageKey, data, mimeType)
    return this.storedFileDBRepository.createKept({
      channel: ATTACHMENTS_CHANNEL,
      storageKey,
      contentType: mimeType,
      sizeBytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    })
  }

  // In memory, base64: what the AI and Whisper receive
  async download(fileId: string): Promise<MediaFile> {
    const file = await this.findAlive(fileId)
    const { data, contentType } = await this.storage.get(file.storageKey)
    return { mimeType: file.contentType || contentType, data: data.toString('base64') }
  }

  async signedUrl(fileId: string | null): Promise<string | null> {
    if (!fileId) return null
    const file = await this.storedFileDBRepository.findById(fileId)
    if (!file || file.status === StoredFileStatus.DELETED) return null
    return this.storage.signedUrl(file.storageKey, FILE_URL_TTL_SECONDS)
  }

  // An expense that uses the file was saved: <env>/finance/drafts/<yyyy-mm>/… → <env>/finance/expenses/<yyyy>/<mm>/…
  // (no expiry). The new key comes from the file's own key, so it stays in the environment it was uploaded to
  async keep(fileId: string): Promise<void> {
    const file = await this.findAlive(fileId)
    if (file.status === StoredFileStatus.KEPT) return

    const [env, root, , month, name] = file.storageKey.split('/')
    const keptKey = [env, root, EXPENSES_FOLDER, ...month.split('-'), name].join('/')
    await this.storage.copy(file.storageKey, keptKey)
    await this.storedFileDBRepository.markKept(file.id, keptKey)
    await this.storage.delete(file.storageKey)
  }

  // An expense was deleted: the file leaves the bucket only if no other draft or expense uses it
  async release(fileId: string): Promise<boolean> {
    const file = await this.storedFileDBRepository.findById(fileId)
    if (!file || file.status === StoredFileStatus.DELETED) return false
    if (await this.storedFileDBRepository.countUses(fileId)) return false

    await this.storage.delete(file.storageKey)
    await this.storedFileDBRepository.markDeleted(file.id)
    return true
  }

  // Daily (D44): temporary files past their 7 days leave the bucket; the row stays as history
  async deleteExpired(now = new Date()): Promise<number> {
    const expired = await this.storedFileDBRepository.findExpired(now, FILE_CLEANUP_BATCH)
    for (const file of expired) {
      await this.storage.delete(file.storageKey)
      await this.storedFileDBRepository.markDeleted(file.id)
    }
    if (expired.length) this.logger.log(`[deleteExpired] ${expired.length} temporary file(s) deleted`)
    return expired.length
  }

  private async findAlive(fileId: string): Promise<StoredFile> {
    const file = await this.storedFileDBRepository.findById(fileId)
    if (!file || file.status === StoredFileStatus.DELETED) throw new StoredFileExpiredException({ fileId })
    return file
  }
}
