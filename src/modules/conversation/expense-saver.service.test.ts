import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { ExpenseDestination, PaymentStatus, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { ExpenseNotSaveableException } from '@/commons/exceptions/conversation/expense-not-saveable.exception'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { CreditCardDBRepository } from '@/db/models/credit-card/creditCardDB.repository'

import { ExpenseSaverService } from './expense-saver.service'
import { buildExpenseFile, FILE_ID } from './mocks/conversation.mock'

const mockExpenseDBRepository = { saveFromExpenseFile: vi.fn() }
const mockCreditCardDBRepository = { findById: vi.fn() }

describe('ExpenseSaverService', () => {
  let service: ExpenseSaverService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseSaverService,
        { provide: ExpenseDBRepository, useValue: mockExpenseDBRepository },
        { provide: CreditCardDBRepository, useValue: mockCreditCardDBRepository },
      ],
    }).compile()

    service = module.get<ExpenseSaverService>(ExpenseSaverService)
    mockExpenseDBRepository.saveFromExpenseFile.mockResolvedValue({ id: 'expense-1' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const savedInput = () => mockExpenseDBRepository.saveFromExpenseFile.mock.calls[0][1]

  it('should save a fixed cost in the month of the expense', async () => {
    await expect(service.save(buildExpenseFile())).resolves.toEqual({ id: 'expense-1' })

    expect(mockExpenseDBRepository.saveFromExpenseFile).toHaveBeenCalledWith(FILE_ID, expect.anything())
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

  it('should use the card closing day for credit card expenses', async () => {
    mockCreditCardDBRepository.findById.mockResolvedValue({ id: 'card-oh', billingCloseDay: 10 })

    await service.save(
      buildExpenseFile({
        destination: ExpenseDestination.CREDIT_CARD,
        creditCardId: 'card-oh',
        spentAt: new Date('2026-09-15T00:00:00.000Z'),
      }),
    )

    expect(savedInput().data).toMatchObject({
      creditCardId: 'card-oh',
      paymentStatus: PaymentStatus.PENDING,
      paymentMonth: 10,
      paymentYear: 2026,
      processDate: new Date('2026-09-15T00:00:00.000Z'),
    })
  })

  it('should save subscriptions with their period and receivables without expense fields', async () => {
    await service.save(
      buildExpenseFile({ destination: ExpenseDestination.SUBSCRIPTION, period: SubscriptionPeriod.MONTHLY }),
    )
    expect(savedInput().data).toMatchObject({ period: SubscriptionPeriod.MONTHLY, paymentMonth: 9 })

    vi.clearAllMocks()
    mockExpenseDBRepository.saveFromExpenseFile.mockResolvedValue({ id: 'expense-2' })

    await service.save(buildExpenseFile({ destination: ExpenseDestination.RECEIVABLE, amount: 100, currency: 'USD' }))
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
    await expect(service.save(buildExpenseFile(overrides))).rejects.toThrow(ExpenseNotSaveableException)
    expect(mockExpenseDBRepository.saveFromExpenseFile).not.toHaveBeenCalled()
  })

  it('should refuse a credit card expense whose card no longer exists', async () => {
    mockCreditCardDBRepository.findById.mockResolvedValue(null)

    await expect(
      service.save(buildExpenseFile({ destination: ExpenseDestination.CREDIT_CARD, creditCardId: 'card-gone' })),
    ).rejects.toThrow(ExpenseNotSaveableException)
  })
})
