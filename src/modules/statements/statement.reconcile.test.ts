import { StatementRowResult } from '@/commons/constants/statement.constant'

import { reconcileStatement } from './statement.reconcile'

const row = (overrides: Record<string, unknown>) => ({
  date: '2026-09-02',
  description: 'NETFLIX.COM',
  amount: 50,
  currency: 'PEN',
  installment: null,
  ...overrides,
})
const expense = (overrides: Record<string, unknown>) => ({
  id: 'e1',
  description: 'Netflix',
  amount: 50,
  processDate: '2026-09-03',
  installment: null,
  ...overrides,
})

describe('reconcileStatement', () => {
  it('should match the same amount within 3 days, and keep the rest as new or missing', () => {
    const result = reconcileStatement(
      [row({}), row({ description: 'TAMBO', amount: 35.5, date: '2026-08-20' })],
      [expense({}), expense({ id: 'e2', description: 'Uber', amount: 20 })],
    )

    expect(result.rows.map((item) => [item.description, item.result, item.expenseId])).toEqual([
      ['NETFLIX.COM', StatementRowResult.MATCHED, 'e1'],
      ['TAMBO', StatementRowResult.NEW, null],
    ])
    expect(result.missing.map((item) => item.id)).toEqual(['e2'])
  })

  it('should match an installment by its number even with dates far apart, each expense only once', () => {
    const result = reconcileStatement(
      [
        row({ description: 'MP*MERCADOLI', amount: 164.9, installment: '2/3', date: '2026-08-15' }),
        row({ description: 'MP*MERCADOLI', amount: 164.9, installment: '2/3', date: '2026-08-15' }),
      ],
      [
        expense({
          id: 'cuota',
          description: 'Mercado Libre',
          amount: 164.9,
          installment: '2/3',
          processDate: '2026-07-15',
        }),
      ],
    )
    expect(result.rows.map((item) => item.result)).toEqual([StatementRowResult.MATCHED, StatementRowResult.NEW])
  })

  it('should not match another amount or a date far away', () => {
    const result = reconcileStatement([row({ amount: 49.9 }), row({ date: '2026-09-20' })], [expense({})])
    expect(result.rows.map((item) => item.result)).toEqual([StatementRowResult.NEW, StatementRowResult.NEW])
  })

  it('should prefer the expense with the same merchant', () => {
    const result = reconcileStatement(
      [row({ description: 'TAMBO VIRREY', amount: 20 })],
      [
        expense({ id: 'uber', description: 'Uber', amount: 20 }),
        expense({ id: 'tambo', description: 'Tambo', amount: 20 }),
      ],
    )
    expect(result.rows[0].expenseId).toBe('tambo')
  })
})
