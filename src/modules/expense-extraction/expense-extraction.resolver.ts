import { Currency, ExpenseDestination } from '@/commons/constants/expense.constant'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import {
  CatalogKind,
  ExpenseField,
  LOW_CONFIDENCE_THRESHOLD,
  REQUIRED_FIELDS_BY_DESTINATION,
} from '@/commons/constants/expense-extraction.constant'
import { ExpenseShare, SharedExpense } from '@/db/models/expense-draft/expenseDraftDB.dto'

import {
  findCatalogEntry,
  findCatalogEntryById,
  findDefaultPerson,
  findPrimaryCard,
} from './expense-extraction.catalog'
import {
  ExtractedExpense,
  ExtractionCatalog,
  ResolvedExpense,
  ResolvedExpenseFields,
} from './dto/expense-extraction.types'

const BASE_REQUIRED_FIELDS = REQUIRED_FIELDS_BY_DESTINATION[ExpenseDestination.RECEIVABLE]

// Turns the AI output into database ids, applies defaults and computes what the bot still has to ask
export function resolveExpense(raw: ExtractedExpense, catalog: ExtractionCatalog, today: string): ResolvedExpense {
  const person = findCatalogEntry(catalog, CatalogKind.PERSON, raw.personRef)
  const paymentMethod = findCatalogEntry(catalog, CatalogKind.PAYMENT_METHOD, raw.paymentMethodRef)
  const category = findCatalogEntry(catalog, CatalogKind.CATEGORY, raw.categoryRef)

  const fields: ResolvedExpenseFields = {
    destination: raw.destination,
    description: raw.description,
    amount: raw.amount,
    currency: raw.currency ?? Currency.PEN,
    spentAt: raw.spentAt ?? today,
    expenseType: raw.expenseType,
    installment: raw.installment,
    period: raw.period,
    // D19: without a person the expense belongs to the default person
    personId: person?.id ?? findDefaultPerson(catalog)?.id ?? null,
    paymentMethodId: paymentMethod?.id ?? null,
    categoryId: category?.id ?? null,
    merchant: raw.merchant,
    operationNumber: raw.operationNumber,
    notes: raw.notes,
  }

  const sharedWith = resolveShares(raw, catalog)
  // The payer is the user: a person named in the shares is someone who owes, not whose expense it is
  if (sharedWith?.shares.some((share) => share.personId === fields.personId)) {
    fields.personId = findDefaultPerson(catalog)?.id ?? fields.personId
  }

  return { ...completeExpense(fields, toFieldConfidence(raw.confidence), catalog), sharedWith }
}

// D74: the shares of the AI with catalog people; parts without a known person, or with nothing to pay, are dropped
function resolveShares(raw: ExtractedExpense, catalog: ExtractionCatalog): SharedExpense | null {
  const shares = (raw.shares ?? []).flatMap((share): ExpenseShare[] => {
    const person = findCatalogEntry(catalog, CatalogKind.PERSON, share.personRef)
    if (!person || person.isDefault) return []
    if (share.amount != null) return [{ personId: person.id, amount: share.amount }]
    return share.ratio ? [{ personId: person.id, ratio: share.ratio }] : []
  })
  return shares.length ? { shares } : null
}

// The payment method decides between day-to-day and credit card expenses:
// a credit card turns a daily (or undecided) expense into a card expense, any other method turns a card
// expense back into a daily one. Fixed costs, subscriptions and receivables keep their destination.
export function applyPaymentMethodRule(
  fields: ResolvedExpenseFields,
  catalog: ExtractionCatalog,
): ResolvedExpenseFields {
  const method = findCatalogEntryById(catalog, fields.paymentMethodId)
  if (!method) return fields

  const isCreditCard = method.paymentType === PaymentMethodType.CREDIT_CARD

  if (isCreditCard && (!fields.destination || fields.destination === ExpenseDestination.DAILY)) {
    return { ...fields, destination: ExpenseDestination.CREDIT_CARD }
  }
  if (!isCreditCard && fields.destination === ExpenseDestination.CREDIT_CARD) {
    return { ...fields, destination: ExpenseDestination.DAILY }
  }
  return fields
}

// D47: a card expense read from a screenshot without its card belongs to the primary card (IO)
export function withPrimaryCard(expense: ResolvedExpense, catalog: ExtractionCatalog): ResolvedExpense {
  if (expense.destination !== ExpenseDestination.CREDIT_CARD || expense.paymentMethodId) return expense
  const primary = findPrimaryCard(catalog)
  return primary ? completeExpense({ ...expense, paymentMethodId: primary.id }, expense.confidence, catalog) : expense
}

// Recomputed after every AI extraction or local correction
export function completeExpense(
  resolvedFields: ResolvedExpenseFields,
  confidence: Record<string, number>,
  catalog: ExtractionCatalog,
): ResolvedExpense {
  const fields = applyPaymentMethodRule(resolvedFields, catalog)

  const required = fields.destination
    ? REQUIRED_FIELDS_BY_DESTINATION[fields.destination as ExpenseDestination]
    : [ExpenseField.DESTINATION, ...BASE_REQUIRED_FIELDS]

  const missingFields = required.filter(
    (field) => field !== ExpenseField.DESTINATION && fields[field as keyof ResolvedExpenseFields] == null,
  )
  if (!fields.destination) missingFields.unshift(ExpenseField.DESTINATION)

  const lowConfidenceFields = Object.entries(confidence)
    .filter(
      ([field, value]) => value < LOW_CONFIDENCE_THRESHOLD && fields[field as keyof ResolvedExpenseFields] != null,
    )
    .map(([field]) => field as ExpenseField)

  return { ...fields, confidence, missingFields, lowConfidenceFields }
}

// The AI reports confidence with its own keys (personRef…); store it with ExpenseDraft field names (personId…)
const REF_TO_FIELD: Record<string, ExpenseField> = {
  personRef: ExpenseField.PERSON,
  paymentMethodRef: ExpenseField.PAYMENT_METHOD,
  categoryRef: ExpenseField.CATEGORY,
}

function toFieldConfidence(confidence: Partial<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(confidence)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .map(([key, value]) => [REF_TO_FIELD[key] ?? key, value]),
  )
}
