import { createHash } from 'node:crypto'

import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { StoredFileStatus } from '@/commons/constants/stored-file.constant'
import { StoredFileExpiredException } from '@/commons/exceptions/stored-file/stored-file-expired.exception'
import { StoredFileDBRepository } from '@/db/models/stored-file/storedFileDB.repository'
import { StoredFile } from '@/generated/prisma/client'
import { OBJECT_STORAGE } from '@/providers/storage/storage.module'

import { StoredFilesService } from './stored-files.service'

const NOW = new Date('2026-09-23T15:00:00.000Z')
const DAY_MS = 24 * 60 * 60_000
const KEY_REGEX = /^dev\/finance\/drafts\/2026-09\/[0-9a-f-]{36}\.jpg$/

const mockRepository = {
  create: vi.fn(),
  findById: vi.fn(),
  findAliveBySha256: vi.fn(),
  countUses: vi.fn(),
  extendExpiry: vi.fn(),
  markKept: vi.fn(),
  findExpired: vi.fn(),
  markDeleted: vi.fn(),
}
const mockStorage = { put: vi.fn(), get: vi.fn(), copy: vi.fn(), delete: vi.fn(), signedUrl: vi.fn() }
const mockConfig = { getOrThrow: vi.fn(() => ({ env: 'dev' })) }

const buildStoredFile = (overrides: Partial<StoredFile> = {}): StoredFile => ({
  id: 'stored-1',
  channel: 'telegram',
  storageKey: 'dev/finance/drafts/2026-09/abc.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 5,
  sha256: 'sha',
  status: StoredFileStatus.TEMPORARY,
  expiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
  keptAt: null,
  deletedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
})

describe('StoredFilesService', () => {
  let service: StoredFilesService

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoredFilesService,
        { provide: StoredFileDBRepository, useValue: mockRepository },
        { provide: OBJECT_STORAGE, useValue: mockStorage },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile()

    service = module.get(StoredFilesService)
    mockRepository.create.mockImplementation(async (data) => buildStoredFile({ ...data, id: 'stored-new' }))
    mockRepository.findAliveBySha256.mockResolvedValue(null)
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    // reset (not clear): a rejected upload must not leak into the next test
    vi.resetAllMocks()
  })

  describe('storeTemporary', () => {
    it('should upload to <env>/finance/drafts/<yyyy-mm>/ and keep only the key and metadata in the database', async () => {
      const data = Buffer.from('image')

      const file = await service.storeTemporary('telegram', data, 'image/jpeg; charset=binary')

      const [key, body, contentType] = mockStorage.put.mock.calls[0]
      expect(key).toMatch(KEY_REGEX)
      expect(body).toBe(data)
      expect(contentType).toBe('image/jpeg')
      expect(mockRepository.create).toHaveBeenCalledWith({
        channel: 'telegram',
        storageKey: key,
        contentType: 'image/jpeg',
        sizeBytes: 5,
        sha256: createHash('sha256').update(data).digest('hex'),
        expiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
      })
      // The bytes never reach the database
      expect(JSON.stringify(mockRepository.create.mock.calls[0][0])).not.toContain(data.toString('base64'))
      expect(file.id).toBe('stored-new')
    })

    it('should reuse a temporary file with the same bytes and give it 7 more days', async () => {
      mockRepository.findAliveBySha256.mockResolvedValue(buildStoredFile({ expiresAt: NOW }))
      mockRepository.extendExpiry.mockResolvedValue(buildStoredFile())

      await service.storeTemporary('web', Buffer.from('image'), 'image/jpeg')

      expect(mockRepository.extendExpiry).toHaveBeenCalledWith('stored-1', new Date(NOW.getTime() + 7 * DAY_MS))
      expect(mockStorage.put).not.toHaveBeenCalled()
      expect(mockRepository.create).not.toHaveBeenCalled()
    })

    it('should reuse a kept file as it is', async () => {
      const kept = buildStoredFile({ status: StoredFileStatus.KEPT, expiresAt: null })
      mockRepository.findAliveBySha256.mockResolvedValue(kept)

      await expect(service.storeTemporary('web', Buffer.from('image'), 'image/jpeg')).resolves.toBe(kept)
      expect(mockRepository.extendExpiry).not.toHaveBeenCalled()
      expect(mockStorage.put).not.toHaveBeenCalled()
    })

    it('should not save the row when the upload fails', async () => {
      mockStorage.put.mockRejectedValue(new Error('R2 down'))

      await expect(service.storeTemporary('web', Buffer.from('image'), 'image/jpeg')).rejects.toThrow('R2 down')
      expect(mockRepository.create).not.toHaveBeenCalled()
    })
  })

  describe('download', () => {
    it('should return the file in base64 for the AI', async () => {
      mockRepository.findById.mockResolvedValue(buildStoredFile())
      mockStorage.get.mockResolvedValue({ data: Buffer.from('image'), contentType: 'application/octet-stream' })

      await expect(service.download('stored-1')).resolves.toEqual({
        mimeType: 'image/jpeg',
        data: Buffer.from('image').toString('base64'),
      })
      expect(mockStorage.get).toHaveBeenCalledWith('dev/finance/drafts/2026-09/abc.jpg')
    })

    it.each([
      ['deleted', buildStoredFile({ status: StoredFileStatus.DELETED })],
      ['missing', null],
    ])('should throw StoredFileExpiredException for a %s file', async (_, file) => {
      mockRepository.findById.mockResolvedValue(file)

      await expect(service.download('stored-1')).rejects.toThrow(StoredFileExpiredException)
      expect(mockStorage.get).not.toHaveBeenCalled()
    })
  })

  describe('signedUrl', () => {
    it('should sign a 10 minute link', async () => {
      mockRepository.findById.mockResolvedValue(buildStoredFile())
      mockStorage.signedUrl.mockResolvedValue('https://signed')

      await expect(service.signedUrl('stored-1')).resolves.toBe('https://signed')
      expect(mockStorage.signedUrl).toHaveBeenCalledWith('dev/finance/drafts/2026-09/abc.jpg', 600)
    })

    it('should return null without a file or once it was deleted', async () => {
      await expect(service.signedUrl(null)).resolves.toBeNull()

      mockRepository.findById.mockResolvedValue(buildStoredFile({ status: StoredFileStatus.DELETED }))
      await expect(service.signedUrl('stored-1')).resolves.toBeNull()
      expect(mockStorage.signedUrl).not.toHaveBeenCalled()
    })
  })

  describe('keep', () => {
    it('should move the file to <env>/finance/expenses/<yyyy>/<mm>/ and mark it kept', async () => {
      mockRepository.findById.mockResolvedValue(buildStoredFile())

      await service.keep('stored-1')

      expect(mockStorage.copy).toHaveBeenCalledWith(
        'dev/finance/drafts/2026-09/abc.jpg',
        'dev/finance/expenses/2026/09/abc.jpg',
      )
      expect(mockRepository.markKept).toHaveBeenCalledWith('stored-1', 'dev/finance/expenses/2026/09/abc.jpg')
      expect(mockStorage.delete).toHaveBeenCalledWith('dev/finance/drafts/2026-09/abc.jpg')
    })

    it('should keep the environment of the file even if the API runs in another one', async () => {
      mockRepository.findById.mockResolvedValue(buildStoredFile({ storageKey: 'prod/finance/drafts/2026-08/x.ogg' }))

      await service.keep('stored-1')

      expect(mockStorage.copy).toHaveBeenCalledWith(
        'prod/finance/drafts/2026-08/x.ogg',
        'prod/finance/expenses/2026/08/x.ogg',
      )
    })

    it('should do nothing for a file already kept', async () => {
      mockRepository.findById.mockResolvedValue(buildStoredFile({ status: StoredFileStatus.KEPT }))

      await service.keep('stored-1')

      expect(mockStorage.copy).not.toHaveBeenCalled()
      expect(mockRepository.markKept).not.toHaveBeenCalled()
    })

    it('should not delete the draft copy when the copy fails', async () => {
      mockRepository.findById.mockResolvedValue(buildStoredFile())
      mockStorage.copy.mockRejectedValue(new Error('R2 down'))

      await expect(service.keep('stored-1')).rejects.toThrow('R2 down')
      expect(mockRepository.markKept).not.toHaveBeenCalled()
      expect(mockStorage.delete).not.toHaveBeenCalled()
    })

    it('should throw StoredFileExpiredException for an expired file', async () => {
      mockRepository.findById.mockResolvedValue(buildStoredFile({ status: StoredFileStatus.DELETED }))

      await expect(service.keep('stored-1')).rejects.toThrow(StoredFileExpiredException)
    })
  })

  describe('release', () => {
    it('should delete a file nobody uses anymore', async () => {
      mockRepository.findById.mockResolvedValue(buildStoredFile({ status: StoredFileStatus.KEPT }))
      mockRepository.countUses.mockResolvedValue(0)

      await expect(service.release('stored-1')).resolves.toBe(true)
      expect(mockStorage.delete).toHaveBeenCalledWith('dev/finance/drafts/2026-09/abc.jpg')
      expect(mockRepository.markDeleted).toHaveBeenCalledWith('stored-1')
    })

    it('should leave a file another expense or draft still uses', async () => {
      mockRepository.findById.mockResolvedValue(buildStoredFile({ status: StoredFileStatus.KEPT }))
      mockRepository.countUses.mockResolvedValue(1)

      await expect(service.release('stored-1')).resolves.toBe(false)
      expect(mockStorage.delete).not.toHaveBeenCalled()
    })

    it('should ignore a file already deleted', async () => {
      mockRepository.findById.mockResolvedValue(buildStoredFile({ status: StoredFileStatus.DELETED }))

      await expect(service.release('stored-1')).resolves.toBe(false)
      expect(mockRepository.countUses).not.toHaveBeenCalled()
    })
  })

  describe('deleteExpired', () => {
    it('should delete the expired temporary files and keep their rows as deleted', async () => {
      mockRepository.findExpired.mockResolvedValue([
        buildStoredFile({ id: 'a', storageKey: 'dev/finance/drafts/2026-09/a.jpg' }),
        buildStoredFile({ id: 'b', storageKey: 'dev/finance/drafts/2026-09/b.ogg' }),
      ])

      await expect(service.deleteExpired()).resolves.toBe(2)

      expect(mockRepository.findExpired).toHaveBeenCalledWith(NOW, 100)
      expect(mockStorage.delete.mock.calls).toEqual([
        ['dev/finance/drafts/2026-09/a.jpg'],
        ['dev/finance/drafts/2026-09/b.ogg'],
      ])
      expect(mockRepository.markDeleted.mock.calls).toEqual([['a'], ['b']])
    })

    it('should do nothing when no file expired', async () => {
      mockRepository.findExpired.mockResolvedValue([])

      await expect(service.deleteExpired()).resolves.toBe(0)
      expect(mockStorage.delete).not.toHaveBeenCalled()
    })
  })
})
