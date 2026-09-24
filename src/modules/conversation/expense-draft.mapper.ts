import { ExpenseDestination } from '@/commons/constants/expense.constant'
import { ExpenseDraftStatus } from '@/commons/constants/expense-draft.constant'
import { LOW_CONFIDENCE_THRESHOLD, ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { ExpenseDraftDbDto, UpdateExpenseDraftDbDto } from '@/db/models/expense-draft/expenseDraftDB.dto'
import { ResolvedExpense, ResolvedExpenseFields } from '@/modules/expense-extraction/dto/expense-extraction.types'

// ExpenseDraft stores dates as DateTime (UTC midnight); the extraction works with YYYY-MM-DD
const toIsoDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null)
const toDate = (isoDate: string | null) => (isoDate ? new Date(`${isoDate}T00:00:00.000Z`) : null)

export function toExpenseFields(expenseDraft: ExpenseDraftDbDto): ResolvedExpenseFields {
  return {
    destination: expenseDraft.destination,
    description: expenseDraft.description,
    amount: expenseDraft.amount,
    currency: expenseDraft.currency,
    spentAt: toIsoDate(expenseDraft.spentAt),
    expenseType: expenseDraft.expenseType,
    installment: expenseDraft.installment,
    period: expenseDraft.period,
    personId: expenseDraft.personId,
    paymentMethodId: expenseDraft.paymentMethodId,
    categoryId: expenseDraft.categoryId,
    merchant: expenseDraft.merchant,
    operationNumber: expenseDraft.operationNumber,
    notes: expenseDraft.notes,
  }
}

// Status and pending question follow the missing fields: ask one at a time, confirm when nothing is missing
export function toExpenseDraftUpdate(expense: ResolvedExpense): UpdateExpenseDraftDbDto {
  const { confidence, missingFields, lowConfidenceFields: _lowConfidenceFields, spentAt, ...fields } = expense

  const status =
    fields.destination === ExpenseDestination.DISCARD
      ? ExpenseDraftStatus.DISCARDED
      : missingFields.length
        ? ExpenseDraftStatus.DRAFT
        : ExpenseDraftStatus.AWAITING_CONFIRMATION

  return {
    ...fields,
    spentAt: toDate(spentAt),
    confidence,
    missingFields,
    status,
    pendingField: status === ExpenseDraftStatus.DRAFT ? missingFields[0] : null,
  }
}

export function lowConfidenceFieldsOf(expenseDraft: ExpenseDraftDbDto): ExpenseField[] {
  const fields = toExpenseFields(expenseDraft)

  return Object.entries(expenseDraft.confidence)
    .filter(
      ([field, value]) => value < LOW_CONFIDENCE_THRESHOLD && fields[field as keyof ResolvedExpenseFields] != null,
    )
    .map(([field]) => field as ExpenseField)
}

// D66: a card purchase "1/n" whose installment amount was only deduced (total / n, with ❓) is confirmed before the
// n rows are created; an amount said in the screenshot or the text is saved without asking
export function needsInstallmentConfirmation(expenseDraft: ExpenseDraftDbDto): boolean {
  const match = /^1\/(\d+)$/.exec(expenseDraft.installment ?? '')
  return (
    expenseDraft.destination === ExpenseDestination.CREDIT_CARD &&
    match != null &&
    Number(match[1]) > 1 &&
    (expenseDraft.confidence[ExpenseField.AMOUNT] ?? 1) < LOW_CONFIDENCE_THRESHOLD
  )
}
