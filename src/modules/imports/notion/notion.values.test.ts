import { Currency, ExpenseType, PaymentStatus, SubscriptionPeriod } from '@/commons/constants/expense.constant'

import {
  currencyOf,
  dateOf,
  expenseTypeOf,
  installmentOf,
  moneyOf,
  monthOf,
  monthYearOf,
  yearNear,
  paymentStatusOf,
  percentOf,
  periodOf,
} from './notion.values'

describe('notion values', () => {
  it('should read months, with Setiembre and Septiembre', () => {
    expect(monthOf('Setiembre')).toBe(9)
    expect(monthOf('septiembre')).toBe(9)
    expect(monthOf('Mayo ')).toBe(5)
    expect(monthOf('Mes')).toBeNull()
    expect(monthYearOf('Setiembre 2026')).toEqual({ month: 9, year: 2026 })
    expect(monthYearOf(' Resumen Setiembre 2026')).toEqual({ month: 9, year: 2026 })
    expect(monthYearOf('Resumen')).toBeNull()
    expect(yearNear(8, '2024-07-29')).toBe(2024)
    expect(yearNear(1, '2024-12-20')).toBe(2025)
    expect(yearNear(12, '2025-01-05')).toBe(2024)
    expect(yearNear(8, null)).toBeNull()
  })

  it('should read amounts with symbols and thousands separators', () => {
    expect(moneyOf('1,042.00')).toBe(1042)
    expect(moneyOf('S/1,042.50')).toBe(1042.5)
    expect(moneyOf('S/ 29.90')).toBe(29.9)
    expect(moneyOf('1.042,50')).toBe(1042.5)
    expect(moneyOf('')).toBeNull()
    expect(percentOf('80%')).toBe(80)
    expect(percentOf('0.36')).toBe(36)
    expect(percentOf('50')).toBe(50)
  })

  it('should read the date formats Notion exports, keeping the start of a range', () => {
    expect(dateOf('19/09/2026')).toBe('2026-09-19')
    expect(dateOf('5/9/2026')).toBe('2026-09-05')
    expect(dateOf('September 19, 2026')).toBe('2026-09-19')
    expect(dateOf('2026-09-19')).toBe('2026-09-19')
    expect(dateOf('19/09/2026 → 21/09/2026')).toBe('2026-09-19')
    expect(dateOf('')).toBeNull()
  })

  it('should map currency, type, installments, statuses and periods of the boards', () => {
    expect(currencyOf('Soles(S/)')).toBe(Currency.PEN)
    expect(currencyOf('Dolares($)')).toBe(Currency.USD)
    expect(currencyOf('')).toBe(Currency.PEN)
    expect(expenseTypeOf('Gasto con culpa')).toBe(ExpenseType.GUILTY_PLEASURE)
    expect(expenseTypeOf('Gasto fijo')).toBe(ExpenseType.ESSENTIAL)
    expect(installmentOf('3/10')).toBe('3/10')
    expect(installmentOf('03 de 10')).toBe('3/10')
    expect(installmentOf('12/10')).toBeNull()
    expect(installmentOf('única')).toBeNull()
    expect(paymentStatusOf('Parcialmente pagado')).toBe(PaymentStatus.PARTIALLY_PAID)
    expect(paymentStatusOf('No Reconocido')).toBe(PaymentStatus.SKIPPED)
    expect(paymentStatusOf('Retrasado')).toBe(PaymentStatus.PENDING)
    expect(paymentStatusOf('???')).toBeNull()
    expect(periodOf('Anual')).toBe(SubscriptionPeriod.ANNUAL)
    expect(periodOf('Exonerado')).toBe(SubscriptionPeriod.MONTHLY)
  })
})
