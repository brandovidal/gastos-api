import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { Prisma } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'
import { PrismaErrorCode } from '@/commons/constants/database.constant'
import { ExpenseDraftChannel, ExpenseDraftStatus } from '@/commons/constants/expense-draft.constant'
import { DuplicateExpenseDraftException } from '@/commons/exceptions/expense-draft/duplicate-expense-draft.exception'
import { ExpenseDraftNotFoundException } from '@/commons/exceptions/expense-draft/expense-draft-not-found.exception'

import { ExpenseDraftDBRepository } from './expenseDraftDB.repository'
import { ExpenseDraftDBSerializer } from './expenseDraftDB.serializer'
import { mockCreateExpenseDraft, mockExpenseDraftRow } from './mocks/expenseDraftDB.mock'

const prismaError = (code: PrismaErrorCode) =>
  new Prisma.PrismaClientKnownRequestError('prisma error', { code, clientVersion: 'test' })

const mockPrismaService = {
  expenseDraft: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}

describe('ExpenseDraftDBRepository', () => {
  let repository: ExpenseDraftDBRepository

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseDraftDBRepository,
        ExpenseDraftDBSerializer,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile()

    repository = module.get<ExpenseDraftDBRepository>(ExpenseDraftDBRepository)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create an expense draft and return it serialized', async () => {
      mockPrismaService.expenseDraft.create.mockResolvedValue(mockExpenseDraftRow)

      const result = await repository.create(mockCreateExpenseDraft)

      expect(mockPrismaService.expenseDraft.create).toHaveBeenCalledWith({ data: mockCreateExpenseDraft })
      expect(result.missingFields).toEqual(['personId'])
    })

    it('should throw DuplicateExpenseDraftException when the message was already received', async () => {
      mockPrismaService.expenseDraft.create.mockRejectedValue(prismaError(PrismaErrorCode.UNIQUE_CONSTRAINT))

      await expect(repository.create(mockCreateExpenseDraft)).rejects.toThrow(DuplicateExpenseDraftException)
    })

    it('should rethrow unknown errors', async () => {
      mockPrismaService.expenseDraft.create.mockRejectedValue(new Error('connection lost'))

      await expect(repository.create(mockCreateExpenseDraft)).rejects.toThrow('connection lost')
    })
  })

  describe('findById', () => {
    it('should return null when the expense draft does not exist', async () => {
      mockPrismaService.expenseDraft.findUnique.mockResolvedValue(null)

      await expect(repository.findById('missing')).resolves.toBeNull()
    })
  })

  describe('findOpenByChat', () => {
    it('should look for the latest open expense draft updated after the given date', async () => {
      const updatedAfter = new Date('2026-09-22T11:30:00.000Z')
      mockPrismaService.expenseDraft.findFirst.mockResolvedValue(mockExpenseDraftRow)

      const result = await repository.findOpenByChat(ExpenseDraftChannel.TELEGRAM, '123456', updatedAfter)

      expect(mockPrismaService.expenseDraft.findFirst).toHaveBeenCalledWith({
        where: {
          channel: ExpenseDraftChannel.TELEGRAM,
          chatId: '123456',
          status: { in: [ExpenseDraftStatus.DRAFT, ExpenseDraftStatus.AWAITING_CONFIRMATION] },
          updatedAt: { gte: updatedAfter },
        },
        orderBy: { updatedAt: 'desc' },
      })
      expect(result?.id).toBe('file-1')
    })
  })

  describe('update', () => {
    it('should serialize JSON fields before updating', async () => {
      mockPrismaService.expenseDraft.update.mockResolvedValue(mockExpenseDraftRow)

      await repository.update('file-1', { missingFields: [], status: ExpenseDraftStatus.AWAITING_CONFIRMATION })

      expect(mockPrismaService.expenseDraft.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: { missingFields: '[]', status: ExpenseDraftStatus.AWAITING_CONFIRMATION },
      })
    })

    it('should throw ExpenseDraftNotFoundException when the record does not exist', async () => {
      mockPrismaService.expenseDraft.update.mockRejectedValue(prismaError(PrismaErrorCode.RECORD_NOT_FOUND))

      await expect(repository.update('missing', { notes: 'x' })).rejects.toThrow(ExpenseDraftNotFoundException)
    })
  })

  describe('moveStaleOpenToReview', () => {
    it('should move open expense drafts older than the given date to Borrador', async () => {
      const before = new Date('2026-09-22T11:30:00.000Z')
      mockPrismaService.expenseDraft.updateMany.mockResolvedValue({ count: 2 })

      const count = await repository.moveStaleOpenToReview(ExpenseDraftChannel.TELEGRAM, '123456', before)

      expect(count).toBe(2)
      expect(mockPrismaService.expenseDraft.updateMany).toHaveBeenCalledWith({
        where: {
          channel: ExpenseDraftChannel.TELEGRAM,
          chatId: '123456',
          status: { in: [ExpenseDraftStatus.DRAFT, ExpenseDraftStatus.AWAITING_CONFIRMATION] },
          updatedAt: { lt: before },
        },
        data: { status: ExpenseDraftStatus.PENDING_REVIEW, pendingField: null },
      })
    })
  })
})
