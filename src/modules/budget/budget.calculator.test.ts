import { BudgetStatus } from '@/commons/constants/budget.constant'

import { budgetStatus, crossedStatus, forecast, percentOf, surplusOf } from './budget.calculator'

describe('budget.calculator', () => {
  it('should give the status of a category against its limit and threshold', () => {
    expect(budgetStatus(79, 100, 80)).toBe(BudgetStatus.OK)
    expect(budgetStatus(80, 100, 80)).toBe(BudgetStatus.WARNING)
    expect(budgetStatus(100, 100, 80)).toBe(BudgetStatus.OVER)
    expect(percentOf(85, 0)).toBe(0)
  })

  it('should alert only when an expense crosses the threshold or 100 %', () => {
    expect(crossedStatus(70, 85, 100, 80)).toBe(BudgetStatus.WARNING)
    expect(crossedStatus(85, 90, 100, 80)).toBeNull()
    expect(crossedStatus(90, 104, 100, 80)).toBe(BudgetStatus.OVER)
    expect(crossedStatus(70, 120, 100, 80)).toBe(BudgetStatus.OVER)
    expect(crossedStatus(104, 110, 100, 80)).toBeNull()
  })

  it('should compute the surplus as salary + extra incomes − expenses (D65)', () => {
    expect(surplusOf(4000, 500, 3120.5)).toBe(1379.5)
    expect(surplusOf(null, 500, 100)).toBeNull()
  })

  it('should project the month at the current pace, the day the limit is reached and what is left per day', () => {
    // 300 in 10 days of 30: 30 per day → 900 by the end, the limit of 600 on day 20
    expect(forecast(300, 600, 10, 30)).toEqual({
      spent: 300,
      limit: 600,
      projected: 900,
      overBy: 300,
      overDay: 20,
      perDayLeft: 14.29, // 300 left for 21 days (today included)
    })
    expect(forecast(100, 600, 10, 30)).toMatchObject({ projected: 300, overBy: 0, overDay: null })
    expect(forecast(0, 600, 1, 30)).toMatchObject({ projected: 0, overDay: null, perDayLeft: 20 })
  })
})
