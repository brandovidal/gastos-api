import { PaymentMethodType } from '@/commons/constants/catalog.constant'

import { countedSubscriptionKinds, DEFAULT_BUDGET_SETTINGS, subscriptionCounts } from './budgetSettingDB.repository'

describe('budget switches (D96, D107)', () => {
  it('should count Recurrentes and leave Plataformas out by default, like the Notion Resumen', () => {
    expect(countedSubscriptionKinds(DEFAULT_BUDGET_SETTINGS)).toEqual(['service', 'annual', 'other'])
    expect(countedSubscriptionKinds({ recurringCount: false, platformsCount: true })).toEqual(['platform'])
    expect(countedSubscriptionKinds({ recurringCount: false, platformsCount: false })).toEqual([])
  })

  it('should never count a subscription paid with a credit card: the card charge already does (D46)', () => {
    const all = { recurringCount: true, platformsCount: true }

    expect(subscriptionCounts(all, 'service', PaymentMethodType.CREDIT_CARD)).toBe(false)
    expect(subscriptionCounts(all, 'service', PaymentMethodType.DEBIT_CARD)).toBe(true)
    expect(subscriptionCounts(all, 'platform', null)).toBe(true)
    expect(subscriptionCounts(DEFAULT_BUDGET_SETTINGS, 'platform', null)).toBe(false)
  })
})
