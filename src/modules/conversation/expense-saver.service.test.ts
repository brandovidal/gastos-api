import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { ExpenseDestination, PaymentStatus, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { ExpenseNotSaveableException } from '@/commons/exceptions/conversation/expense-not-saveable.exception'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { PaymentMethodDBRepository } from '@/db/models/payment-method/paymentMethodDB.repository'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'

import { ExpenseSaverService } from './expense-saver.service'
import { buildExpenseDraft, FILE_ID } from './mocks/conversation.mock'

const mockExpenseDBRepository = { saveFromExpenseDraft: vi.fn() }
const mockPaymentMethodDBRepository = { findById: vi.fn() }
const mockStoredFilesService = { keep: vi.fn() }

describe('ExpenseSaverService', () => {
  let service: ExpenseSaverService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseSaverService,
        { provide: ExpenseDBRepository, useValue: mockExpenseDBRepository },
        { provide: PaymentMethodDBRepository, useValue: mockPaymentMethodDBRepository },
        { provide: StoredFilesService, useValue: mockStoredFilesService },
      ],
    }).compile()

    service = module.get<ExpenseSaverService>(ExpenseSaverService)
    mockExpenseDBRepository.saveFromExpenseDraft.mockResolvedValue({ id: 'expense-1' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const savedInput = () => mockExpenseDBRepository.saveFromExpenseDraft.mock.calls[0][1]

  it('should save a day-to-day expense in exp_daily_expenses with its payment method and date', async () => {
    await service.save(buildExpenseDraft({ destination: ExpenseDestination.DAILY }))

    expect(mockExpenseDBRepository.saveFromExpenseDraft).toHaveBeenCalledWith(FILE_ID, expect.anything())
    expect(savedInput()).toEqual({
      destination: ExpenseDestination.DAILY,
      data: expect.objectContaining({
        description: 'Almuerzo',
        amount: 25,
        amountInPen: 25,
        personId: 'person-danery',
        paymentMethodId: 'method-yape',
        categoryId: 'category-food',
        spentAt: new Date('2026-09-22T00:00:00.000Z'),
      }),
    })
  })

  it('should refuse a day-to-day expense without payment method', async () => {
    await expect(
      service.save(buildExpenseDraft({ destination: ExpenseDestination.DAILY, paymentMethodId: null })),
    ).rejects.toThrow(ExpenseNotSaveableException)
  })

  it('should save a fixed cost in the month of the expense', async () => {
    await expect(service.save(buildExpenseDraft())).resolves.toEqual({ id: 'expense-1' })

    expect(mockExpenseDBRepository.saveFromExpenseDraft).toHaveBeenCalledWith(FILE_ID, expect.anything())
    expect(savedInput()).toEqual({
      destination: ExpenseDestination.FIXED_COST,
      data: expect.objectContaining({
        description: 'Almuerzo',
        amount: 25,
        amountInPen: 25,
        personId: 'person-danery',
        categoryId: 'category-food',
        paymentMethodId: 'method-yape',
        paymentStatus: PaymentStatus.NOT_STARTED,
        paymentMonth: 9,
        paymentYear: 2026,
      }),
    })
  })

  it('should use the closing day of the card (a payment method) for credit card expenses', async () => {
    mockPaymentMethodDBRepository.findById.mockResolvedValue({ id: 'method-ohpay', billingCloseDay: 10 })

    await service.save(
      buildExpenseDraft({
        destination: ExpenseDestination.CREDIT_CARD,
        paymentMethodId: 'method-ohpay',
        spentAt: new Date('2026-09-15T00:00:00.000Z'),
      }),
    )

    expect(mockPaymentMethodDBRepository.findById).toHaveBeenCalledWith('method-ohpay')
    expect(savedInput().data).toMatchObject({
      paymentMethodId: 'method-ohpay',
      paymentStatus: PaymentStatus.PENDING,
      paymentMonth: 10,
      paymentYear: 2026,
      processDate: new Date('2026-09-15T00:00:00.000Z'),
    })
  })

  it('should bill a card without closing day (created from the bot) in the month of the purchase', async () => {
    mockPaymentMethodDBRepository.findById.mockResolvedValue({ id: 'method-new', billingCloseDay: null })

    await service.save(
      buildExpenseDraft({
        destination: ExpenseDestination.CREDIT_CARD,
        paymentMethodId: 'method-new',
        spentAt: new Date('2026-09-28T00:00:00.000Z'),
      }),
    )

    expect(savedInput().data).toMatchObject({ paymentMonth: 9, paymentYear: 2026 })
  })

  it('should save subscriptions with their period and receivables without expense fields', async () => {
    await service.save(
      buildExpenseDraft({ destination: ExpenseDestination.SUBSCRIPTION, period: SubscriptionPeriod.MONTHLY }),
    )
    expect(savedInput().data).toMatchObject({ period: SubscriptionPeriod.MONTHLY, paymentMonth: 9 })

    vi.clearAllMocks()
    mockExpenseDBRepository.saveFromExpenseDraft.mockResolvedValue({ id: 'expense-2' })

    await service.save(buildExpenseDraft({ destination: ExpenseDestination.RECEIVABLE, amount: 100, currency: 'USD' }))
    expect(savedInput().data).toEqual({
      description: 'Almuerzo',
      amount: 100,
      currency: 'USD',
      exchangeRate: null,
      amountInPen: null,
      personId: 'person-danery',
      notes: null,
    })
  })

  it.each([
    ['missing fields', { missingFields: [ExpenseField.CATEGORY] }],
    ['no destination', { destination: null }],
    ['a discarded item', { destination: ExpenseDestination.DISCARD }],
    ['a fixed cost without category', { categoryId: null }],
  ])('should refuse %s', async (_case, overrides) => {
    await expect(service.save(buildExpenseDraft(overrides))).rejects.toThrow(ExpenseNotSaveableException)
    expect(mockExpenseDBRepository.saveFromExpenseDraft).not.toHaveBeenCalled()
  })

  it('should refuse a credit card expense whose payment method no longer exists', async () => {
    mockPaymentMethodDBRepository.findById.mockResolvedValue(null)

    await expect(
      service.save(buildExpenseDraft({ destination: ExpenseDestination.CREDIT_CARD, paymentMethodId: 'gone' })),
    ).rejects.toThrow(ExpenseNotSaveableException)
  })

  // D58: the screenshot of a saved expense moves from drafts/ to expenses/
  describe('stored files', () => {
    it('should keep the file of the saved expense', async () => {
      await service.save(buildExpenseDraft({ fileId: 'stored-1' }))

      expect(mockStoredFilesService.keep).toHaveBeenCalledWith('stored-1')
    })

    it('should keep the expense saved when the file cannot be moved', async () => {
      mockStoredFilesService.keep.mockRejectedValue(new Error('R2 down'))
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})

      await expect(service.save(buildExpenseDraft({ fileId: 'stored-1' }))).resolves.toEqual({ id: 'expense-1' })
    })

    it('should not touch storage for an expense without a file', async () => {
      await service.save(buildExpenseDraft())

      expect(mockStoredFilesService.keep).not.toHaveBeenCalled()
    })

    it('should not keep the file when the save fails', async () => {
      await expect(
        service.save(buildExpenseDraft({ fileId: 'stored-1', missingFields: [ExpenseField.AMOUNT] })),
      ).rejects.toThrow(ExpenseNotSaveableException)

      expect(mockStoredFilesService.keep).not.toHaveBeenCalled()
    })
  })
})
