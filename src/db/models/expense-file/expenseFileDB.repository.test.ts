import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { Prisma } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'
import { PrismaErrorCode } from '@/commons/constants/database.constant'
import { ExpenseFileChannel, ExpenseFileStatus } from '@/commons/constants/expense-file.constant'
import { DuplicateExpenseFileException } from '@/commons/exceptions/expense-file/duplicate-expense-file.exception'
import { ExpenseFileNotFoundException } from '@/commons/exceptions/expense-file/expense-file-not-found.exception'

import { ExpenseFileDBRepository } from './expenseFileDB.repository'
import { ExpenseFileDBSerializer } from './expenseFileDB.serializer'
import { mockCreateExpenseFile, mockExpenseFileRow } from './mocks/expenseFileDB.mock'

const prismaError = (code: PrismaErrorCode) =>
  new Prisma.PrismaClientKnownRequestError('prisma error', { code, clientVersion: 'test' })

const mockPrismaService = {
  expenseFile: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}

describe('ExpenseFileDBRepository', () => {
  let repository: ExpenseFileDBRepository

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseFileDBRepository,
        ExpenseFileDBSerializer,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile()

    repository = module.get<ExpenseFileDBRepository>(ExpenseFileDBRepository)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should create an expense file and return it serialized', async () => {
      mockPrismaService.expenseFile.create.mockResolvedValue(mockExpenseFileRow)

      const result = await repository.create(mockCreateExpenseFile)

      expect(mockPrismaService.expenseFile.create).toHaveBeenCalledWith({ data: mockCreateExpenseFile })
      expect(result.missingFields).toEqual(['personId'])
    })

    it('should throw DuplicateExpenseFileException when the message was already received', async () => {
      mockPrismaService.expenseFile.create.mockRejectedValue(prismaError(PrismaErrorCode.UNIQUE_CONSTRAINT))

      await expect(repository.create(mockCreateExpenseFile)).rejects.toThrow(DuplicateExpenseFileException)
    })

    it('should rethrow unknown errors', async () => {
      mockPrismaService.expenseFile.create.mockRejectedValue(new Error('connection lost'))

      await expect(repository.create(mockCreateExpenseFile)).rejects.toThrow('connection lost')
    })
  })

  describe('findById', () => {
    it('should return null when the expense file does not exist', async () => {
      mockPrismaService.expenseFile.findUnique.mockResolvedValue(null)

      await expect(repository.findById('missing')).resolves.toBeNull()
    })
  })

  describe('findOpenByChat', () => {
    it('should look for the latest open expense file updated after the given date', async () => {
      const updatedAfter = new Date('2026-09-22T11:30:00.000Z')
      mockPrismaService.expenseFile.findFirst.mockResolvedValue(mockExpenseFileRow)

      const result = await repository.findOpenByChat(ExpenseFileChannel.TELEGRAM, '123456', updatedAfter)

      expect(mockPrismaService.expenseFile.findFirst).toHaveBeenCalledWith({
        where: {
          channel: ExpenseFileChannel.TELEGRAM,
          chatId: '123456',
          status: { in: [ExpenseFileStatus.DRAFT, ExpenseFileStatus.AWAITING_CONFIRMATION] },
          updatedAt: { gte: updatedAfter },
        },
        orderBy: { updatedAt: 'desc' },
      })
      expect(result?.id).toBe('file-1')
    })
  })

  describe('update', () => {
    it('should serialize JSON fields before updating', async () => {
      mockPrismaService.expenseFile.update.mockResolvedValue(mockExpenseFileRow)

      await repository.update('file-1', { missingFields: [], status: ExpenseFileStatus.AWAITING_CONFIRMATION })

      expect(mockPrismaService.expenseFile.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: { missingFields: '[]', status: ExpenseFileStatus.AWAITING_CONFIRMATION },
      })
    })

    it('should throw ExpenseFileNotFoundException when the record does not exist', async () => {
      mockPrismaService.expenseFile.update.mockRejectedValue(prismaError(PrismaErrorCode.RECORD_NOT_FOUND))

      await expect(repository.update('missing', { notes: 'x' })).rejects.toThrow(ExpenseFileNotFoundException)
    })
  })

  describe('discardOpenUpdatedBefore', () => {
    it('should discard open expense files older than the given date', async () => {
      const before = new Date('2026-09-22T11:30:00.000Z')
      mockPrismaService.expenseFile.updateMany.mockResolvedValue({ count: 2 })

      const count = await repository.discardOpenUpdatedBefore(ExpenseFileChannel.TELEGRAM, '123456', before)

      expect(count).toBe(2)
      expect(mockPrismaService.expenseFile.updateMany).toHaveBeenCalledWith({
        where: {
          channel: ExpenseFileChannel.TELEGRAM,
          chatId: '123456',
          status: { in: [ExpenseFileStatus.DRAFT, ExpenseFileStatus.AWAITING_CONFIRMATION] },
          updatedAt: { lt: before },
        },
        data: { status: ExpenseFileStatus.DISCARDED },
      })
    })
  })
})
