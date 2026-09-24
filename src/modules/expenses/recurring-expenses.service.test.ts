import { Test } from '@nestjs/testing'
import { vi } from 'vitest'

import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { PaymentStatus, RecurringTargetType, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import { RecurringExpenseDBRepository } from '@/db/models/recurring-expense/recurringExpenseDB.repository'

import { RecurringExpensesService } from './recurring-expenses.service'

const mockRecurringDB = { findActive: vi.fn(), findDefaultCategoryId: vi.fn(), generate: vi.fn() }

const recurring = (overrides: Record<string, unknown>) => ({
  id: 'rec',
  description: 'Alquiler',
  amount: 1200,
  currency: 'PEN',
  targetType: RecurringTargetType.FIXED_COST,
  expenseType: 'essential',
  personId: 'me',
  categoryId: 'home',
  paymentMethodId: null,
  paymentMethod: null,
  dayOfMonth: 5,
  isActive: true,
  lastGeneratedAt: null,
  ...overrides,
})

describe('RecurringExpensesService', () => {
  let service: RecurringExpensesService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [RecurringExpensesService, { provide: RecurringExpenseDBRepository, useValue: mockRecurringDB }],
    }).compile()
    service = module.get(RecurringExpensesService)
    mockRecurringDB.findDefaultCategoryId.mockResolvedValue('default-category')
    mockRecurringDB.generate.mockImplementation(async (id: string) => `row-${id}`)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should create a pending fixed cost due on its day, marking the month', async () => {
    mockRecurringDB.findActive.mockResolvedValue([recurring({})])

    const result = await service.generate(10, 2026)

    expect(mockRecurringDB.generate).toHaveBeenCalledWith('rec', new Date('2026-10-01T00:00:00.000Z'), {
      targetType: RecurringTargetType.FIXED_COST,
      data: expect.objectContaining({
        description: 'Alquiler',
        amount: 1200,
        amountInPen: 1200,
        paymentStatus: PaymentStatus.NOT_STARTED,
        paymentMonth: 10,
        paymentYear: 2026,
        dueDate: new Date('2026-10-05T00:00:00.000Z'),
        categoryId: 'home',
        personId: 'me',
      }),
    })
    expect(result.created).toEqual([expect.objectContaining({ id: 'row-rec', date: '2026-10-05' })])
  })

  it('should put a monthly subscription and a card charge in its statement', async () => {
    mockRecurringDB.findActive.mockResolvedValue([
      recurring({ id: 'netflix', targetType: RecurringTargetType.SUBSCRIPTION, categoryId: null, dayOfMonth: 31 }),
      recurring({
        id: 'gym',
        targetType: RecurringTargetType.CREDIT_CARD,
        paymentMethodId: 'io',
        paymentMethod: { type: PaymentMethodType.CREDIT_CARD, billingCloseDay: 25 },
        dayOfMonth: 28,
      }),
    ])

    await service.generate(9, 2026)

    expect(mockRecurringDB.generate.mock.calls[0][2]).toEqual({
      targetType: RecurringTargetType.SUBSCRIPTION,
      data: expect.objectContaining({
        period: SubscriptionPeriod.MONTHLY,
        dueDate: new Date('2026-09-30T00:00:00.000Z'),
      }),
    })
    // Bought on the 28th, after IO closes on the 25th: October statement
    expect(mockRecurringDB.generate.mock.calls[1][2]).toEqual({
      targetType: RecurringTargetType.CREDIT_CARD,
      data: expect.objectContaining({
        paymentMethodId: 'io',
        processDate: new Date('2026-09-28T00:00:00.000Z'),
        paymentMonth: 10,
        paymentYear: 2026,
      }),
    })
  })

  it('should skip what was already generated, card charges without a card and fixed costs without a category', async () => {
    mockRecurringDB.findDefaultCategoryId.mockResolvedValue(null)
    mockRecurringDB.findActive.mockResolvedValue([
      recurring({ id: 'done' }),
      recurring({ id: 'nocard', targetType: RecurringTargetType.CREDIT_CARD }),
      recurring({ id: 'nocat', categoryId: null }),
    ])
    mockRecurringDB.generate.mockResolvedValue(null)

    const result = await service.generate(10, 2026)

    expect(result.created).toEqual([])
    expect(result.skipped.map((item) => [item.recurringId, item.reason])).toEqual([
      ['done', 'already_generated'],
      ['nocard', 'missing_card'],
      ['nocat', 'missing_category'],
    ])
    expect(mockRecurringDB.generate).toHaveBeenCalledTimes(1)
  })
})
