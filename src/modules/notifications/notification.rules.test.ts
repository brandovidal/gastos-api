import { BudgetStatus } from '@/commons/constants/budget.constant'
import { PaymentStatus, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import { CategoryBudgetLine } from '@/modules/budget/budget.service'

import {
  budgetAlerts,
  ChargeRow,
  duplicateCharges,
  notCharged,
  priceChanges,
  SubscriptionRow,
} from './notification.rules'

const charge = (overrides: Partial<ChargeRow>): ChargeRow => ({
  id: 'c1',
  source: 'card',
  description: 'NETFLIX.COM',
  amount: 44.9,
  currency: 'PEN',
  paymentMethodId: 'io',
  date: '2026-09-23',
  ...overrides,
})

const subscription = (overrides: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: 's1',
  description: 'Netflix',
  amount: 44.9,
  currency: 'PEN',
  period: SubscriptionPeriod.MONTHLY,
  paymentStatus: PaymentStatus.NOT_STARTED,
  dueDate: '2026-09-15',
  ...overrides,
})

describe('notification.rules', () => {
  describe('priceChanges', () => {
    it('should compare a platform charge with its previous charge of the same name', () => {
      const recent = charge({ id: 'c2', amount: 49.9 })
      const previous = charge({ id: 'c1', amount: 44.9, date: '2026-08-23' })

      expect(priceChanges([recent], [subscription()], [previous, recent])).toEqual([
        { charge: recent, subscription: subscription(), before: 44.9 },
      ])
    })

    it('should compare with the subscription when there is no previous charge', () => {
      expect(priceChanges([charge({ amount: 52 })], [subscription()], [])).toHaveLength(1)
    })

    it('should ignore the same price, rounding differences and charges of no platform', () => {
      expect(priceChanges([charge({ amount: 45.2 })], [subscription()], [])).toEqual([])
      expect(priceChanges([charge({ description: 'Tambo', amount: 12 })], [subscription()], [])).toEqual([])
    })
  })

  describe('duplicateCharges', () => {
    it('should find the same amount, method and merchant within 48 h', () => {
      const first = charge({ id: 'a', description: 'Rappi pedido', date: '2026-09-22' })
      const second = charge({ id: 'b', description: 'RAPPI', date: '2026-09-23' })

      expect(duplicateCharges([second, first])).toEqual([{ first, second }])
    })

    it('should not match other amounts, methods, merchants or days far apart', () => {
      const base = charge({ id: 'a', description: 'Rappi' })
      expect(
        duplicateCharges([
          base,
          charge({ id: 'b', description: 'Rappi', amount: 10 }),
          charge({ id: 'c', description: 'Rappi', paymentMethodId: 'cmr' }),
          charge({ id: 'd', description: 'Tambo' }),
          charge({ id: 'e', description: 'Rappi', date: '2026-09-27' }),
        ]),
      ).toEqual([])
    })
  })

  describe('notCharged', () => {
    it('should flag a monthly subscription unpaid 3 days after its due date without a card charge', () => {
      expect(notCharged([subscription()], [charge({ description: 'Spotify' })], '2026-09-19')).toEqual([subscription()])
    })

    it('should wait the 3 days and skip the ones charged, paid or not monthly', () => {
      expect(notCharged([subscription()], [], '2026-09-18')).toEqual([])
      expect(notCharged([subscription()], [charge({})], '2026-09-25')).toEqual([])
      expect(notCharged([subscription({ paymentStatus: PaymentStatus.PAID })], [], '2026-09-25')).toEqual([])
      expect(notCharged([subscription({ period: SubscriptionPeriod.ANNUAL })], [], '2026-09-25')).toEqual([])
    })
  })

  it('should alert the categories at their threshold or over their limit', () => {
    const line = (categoryId: string | null, status: BudgetStatus | null) =>
      ({ categoryId, status }) as CategoryBudgetLine

    expect(
      budgetAlerts([
        line('food', BudgetStatus.WARNING),
        line('home', BudgetStatus.OVER),
        line('fun', BudgetStatus.OK),
        line('car', null),
        line(null, BudgetStatus.OVER),
      ]).map((alert) => alert.categoryId),
    ).toEqual(['food', 'home'])
  })
})
