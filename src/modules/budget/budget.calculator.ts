import { BudgetStatus } from '@/commons/constants/budget.constant'

// Pure budget math (P19), shared by GET /v1/summary and the bot (/presupuesto, /pronostico, alert on save)

const round2 = (value: number) => Math.round(value * 100) / 100

export const percentOf = (spent: number, limit: number) => (limit > 0 ? round2((spent / limit) * 100) : 0)

export function budgetStatus(spent: number, limit: number, alertThreshold: number): BudgetStatus {
  const percent = percentOf(spent, limit)
  if (percent >= 100) return BudgetStatus.OVER
  if (percent >= alertThreshold) return BudgetStatus.WARNING
  return BudgetStatus.OK
}

// The alert is sent only when this expense crosses the threshold or 100 %, not on every later expense
export function crossedStatus(
  spentBefore: number,
  spentAfter: number,
  limit: number,
  alertThreshold: number,
): BudgetStatus | null {
  const before = budgetStatus(spentBefore, limit, alertThreshold)
  const after = budgetStatus(spentAfter, limit, alertThreshold)
  return after !== before && after !== BudgetStatus.OK ? after : null
}

// Surplus (D65): salary + extra incomes − expenses of the month (PEN)
export const surplusOf = (salary: number | null, extraIncome: number, spent: number) =>
  salary == null ? null : round2(salary + extraIncome - spent)

export interface CategoryForecast {
  spent: number
  limit: number
  projected: number // at this pace by the end of the month
  overBy: number // projected − limit, 0 when it fits
  overDay: number | null // day of the month the limit is reached at this pace (null: it is not reached)
  perDayLeft: number // what can still be spent per remaining day (today included) to stay within the limit
}

// /pronostico: linear projection of what was spent in the first `day` days of a month of `daysInMonth` days
export function forecast(spent: number, limit: number, day: number, daysInMonth: number): CategoryForecast {
  const dailyRate = day > 0 ? spent / day : 0
  const projected = round2(dailyRate * daysInMonth)
  const reachDay = dailyRate > 0 ? Math.ceil(limit / dailyRate) : null
  const daysLeft = daysInMonth - day + 1
  return {
    spent: round2(spent),
    limit,
    projected,
    overBy: round2(Math.max(0, projected - limit)),
    overDay: reachDay != null && reachDay <= daysInMonth ? Math.max(reachDay, 1) : null,
    perDayLeft: round2(Math.max(0, limit - spent) / Math.max(daysLeft, 1)),
  }
}
