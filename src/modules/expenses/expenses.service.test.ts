import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { ExpenseNotFoundException } from '@/commons/exceptions/expense/expense-not-found.exception'
import { ExpenseRecordDBRepository, ExpenseResource } from '@/db/models/expense-record/expenseRecordDB.repository'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'

import { ExpensesService } from './expenses.service'

const mockExpenseRecordDB = { delete: vi.fn() }
const mockStoredFiles = { release: vi.fn() }

describe('ExpensesService', () => {
  let service: ExpensesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: ExpenseRecordDBRepository, useValue: mockExpenseRecordDB },
        { provide: StoredFilesService, useValue: mockStoredFiles },
      ],
    }).compile()

    service = module.get(ExpensesService)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // D58: the screenshot goes with the expense, unless something else still uses it (checked by release)
  describe('delete', () => {
    it('should release the file of the deleted expense', async () => {
      mockExpenseRecordDB.delete.mockResolvedValue({ fileId: 'stored-1' })

      await service.delete(ExpenseResource.DAILY, 'expense-1')

      expect(mockExpenseRecordDB.delete).toHaveBeenCalledWith(ExpenseResource.DAILY, 'expense-1')
      expect(mockStoredFiles.release).toHaveBeenCalledWith('stored-1')
    })

    it('should not touch storage for an expense without a file', async () => {
      mockExpenseRecordDB.delete.mockResolvedValue({ fileId: null })

      await service.delete(ExpenseResource.FIXED_COST, 'expense-1')

      expect(mockStoredFiles.release).not.toHaveBeenCalled()
    })

    it('should keep the expense deleted when the file cannot be released', async () => {
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
      mockExpenseRecordDB.delete.mockResolvedValue({ fileId: 'stored-1' })
      mockStoredFiles.release.mockRejectedValue(new Error('R2 down'))

      await expect(service.delete(ExpenseResource.DAILY, 'expense-1')).resolves.toBeUndefined()
    })

    it('should not release anything when the expense does not exist', async () => {
      mockExpenseRecordDB.delete.mockRejectedValue(
        new ExpenseNotFoundException({ resource: ExpenseResource.DAILY, id: 'x' }),
      )

      await expect(service.delete(ExpenseResource.DAILY, 'x')).rejects.toThrow(ExpenseNotFoundException)
      expect(mockStoredFiles.release).not.toHaveBeenCalled()
    })
  })
})
