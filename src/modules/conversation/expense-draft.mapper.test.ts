import { ExpenseDestination } from '@/commons/constants/expense.constant'
import { ExpenseDraftStatus } from '@/commons/constants/expense-draft.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'

import { lowConfidenceFieldsOf, toExpenseFields, toExpenseDraftUpdate } from './expense-draft.mapper'
import { buildExpenseDraft, buildResolvedExpense } from './mocks/conversation.mock'

describe('expense draft mapper', () => {
  it('should read ExpenseDraft dates as YYYY-MM-DD', () => {
    expect(toExpenseFields(buildExpenseDraft()).spentAt).toBe('2026-09-22')
  })

  it('should wait for confirmation when nothing is missing', () => {
    const update = toExpenseDraftUpdate(buildResolvedExpense())

    expect(update.status).toBe(ExpenseDraftStatus.AWAITING_CONFIRMATION)
    expect(update.pendingField).toBeNull()
    expect(update.spentAt).toEqual(new Date('2026-09-22T00:00:00.000Z'))
  })

  it('should ask the first missing field', () => {
    const update = toExpenseDraftUpdate(
      buildResolvedExpense({ missingFields: [ExpenseField.CATEGORY, ExpenseField.PAYMENT_METHOD] }),
    )

    expect(update.status).toBe(ExpenseDraftStatus.DRAFT)
    expect(update.pendingField).toBe(ExpenseField.CATEGORY)
  })

  it('should discard items the AI marked as not an expense', () => {
    const update = toExpenseDraftUpdate(buildResolvedExpense({ destination: ExpenseDestination.DISCARD }))

    expect(update.status).toBe(ExpenseDraftStatus.DISCARDED)
  })

  it('should flag only filled fields with low confidence', () => {
    const expenseDraft = buildExpenseDraft({ confidence: { personId: 0.4, notes: 0.1, amount: 0.9 } })

    expect(lowConfidenceFieldsOf(expenseDraft)).toEqual([ExpenseField.PERSON])
  })
})
