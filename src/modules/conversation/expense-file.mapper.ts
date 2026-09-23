import { ExpenseDestination } from '@/commons/constants/expense.constant'
import { ExpenseFileStatus } from '@/commons/constants/expense-file.constant'
import { LOW_CONFIDENCE_THRESHOLD, ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { ExpenseFileDbDto, UpdateExpenseFileDbDto } from '@/db/models/expense-file/expenseFileDB.dto'
import { ResolvedExpense, ResolvedExpenseFields } from '@/modules/expense-extraction/dto/expense-extraction.types'

// ExpenseFile stores dates as DateTime (UTC midnight); the extraction works with YYYY-MM-DD
const toIsoDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null)
const toDate = (isoDate: string | null) => (isoDate ? new Date(`${isoDate}T00:00:00.000Z`) : null)

export function toExpenseFields(expenseFile: ExpenseFileDbDto): ResolvedExpenseFields {
  return {
    destination: expenseFile.destination,
    description: expenseFile.description,
    amount: expenseFile.amount,
    currency: expenseFile.currency,
    spentAt: toIsoDate(expenseFile.spentAt),
    expenseType: expenseFile.expenseType,
    installment: expenseFile.installment,
    period: expenseFile.period,
    personId: expenseFile.personId,
    paymentMethodId: expenseFile.paymentMethodId,
    creditCardId: expenseFile.creditCardId,
    categoryId: expenseFile.categoryId,
    merchant: expenseFile.merchant,
    operationNumber: expenseFile.operationNumber,
    notes: expenseFile.notes,
  }
}

// Status and pending question follow the missing fields: ask one at a time, confirm when nothing is missing
export function toExpenseFileUpdate(expense: ResolvedExpense): UpdateExpenseFileDbDto {
  const { confidence, missingFields, lowConfidenceFields: _lowConfidenceFields, spentAt, ...fields } = expense

  const status =
    fields.destination === ExpenseDestination.DISCARD
      ? ExpenseFileStatus.DISCARDED
      : missingFields.length
        ? ExpenseFileStatus.DRAFT
        : ExpenseFileStatus.AWAITING_CONFIRMATION

  return {
    ...fields,
    spentAt: toDate(spentAt),
    confidence,
    missingFields,
    status,
    pendingField: status === ExpenseFileStatus.DRAFT ? missingFields[0] : null,
  }
}

export function lowConfidenceFieldsOf(expenseFile: ExpenseFileDbDto): ExpenseField[] {
  const fields = toExpenseFields(expenseFile)

  return Object.entries(expenseFile.confidence)
    .filter(
      ([field, value]) => value < LOW_CONFIDENCE_THRESHOLD && fields[field as keyof ResolvedExpenseFields] != null,
    )
    .map(([field]) => field as ExpenseField)
}
