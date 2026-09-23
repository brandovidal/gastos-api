import { ExpenseDestination } from '@/commons/constants/expense.constant'
import { ExpenseFileStatus } from '@/commons/constants/expense-file.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'

import { lowConfidenceFieldsOf, toExpenseFields, toExpenseFileUpdate } from './expense-file.mapper'
import { buildExpenseFile, buildResolvedExpense } from './mocks/conversation.mock'

describe('expense file mapper', () => {
  it('should read ExpenseFile dates as YYYY-MM-DD', () => {
    expect(toExpenseFields(buildExpenseFile()).spentAt).toBe('2026-09-22')
  })

  it('should wait for confirmation when nothing is missing', () => {
    const update = toExpenseFileUpdate(buildResolvedExpense())

    expect(update.status).toBe(ExpenseFileStatus.AWAITING_CONFIRMATION)
    expect(update.pendingField).toBeNull()
    expect(update.spentAt).toEqual(new Date('2026-09-22T00:00:00.000Z'))
  })

  it('should ask the first missing field', () => {
    const update = toExpenseFileUpdate(
      buildResolvedExpense({ missingFields: [ExpenseField.CATEGORY, ExpenseField.PAYMENT_METHOD] }),
    )

    expect(update.status).toBe(ExpenseFileStatus.DRAFT)
    expect(update.pendingField).toBe(ExpenseField.CATEGORY)
  })

  it('should discard items the AI marked as not an expense', () => {
    const update = toExpenseFileUpdate(buildResolvedExpense({ destination: ExpenseDestination.DISCARD }))

    expect(update.status).toBe(ExpenseFileStatus.DISCARDED)
  })

  it('should flag only filled fields with low confidence', () => {
    const expenseFile = buildExpenseFile({ confidence: { personId: 0.4, notes: 0.1, amount: 0.9 } })

    expect(lowConfidenceFieldsOf(expenseFile)).toEqual([ExpenseField.PERSON])
  })
})
