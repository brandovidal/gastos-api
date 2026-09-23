import { Currency, ExpenseDestination } from '@/commons/constants/expense.constant'
import {
  CatalogKind,
  ExpenseField,
  LOW_CONFIDENCE_THRESHOLD,
  REQUIRED_FIELDS_BY_DESTINATION,
} from '@/commons/constants/expense-extraction.constant'

import { findCatalogEntry, findDefaultPerson } from './expense-extraction.catalog'
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
  const creditCard = findCatalogEntry(catalog, CatalogKind.CREDIT_CARD, raw.creditCardRef)
  const category = findCatalogEntry(catalog, CatalogKind.CATEGORY, raw.categoryRef)

  // A payment method linked to a credit card fills the card and, if the AI had no opinion, the destination
  const creditCardId = creditCard?.id ?? paymentMethod?.creditCardId ?? null
  const destination = raw.destination ?? (creditCardId ? ExpenseDestination.CREDIT_CARD : null)

  const fields: ResolvedExpenseFields = {
    destination,
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
    creditCardId,
    categoryId: category?.id ?? null,
    merchant: raw.merchant,
    operationNumber: raw.operationNumber,
    notes: raw.notes,
  }

  return completeExpense(fields, toFieldConfidence(raw.confidence))
}

// Recomputed after every AI extraction or local correction
export function completeExpense(
  resolvedFields: ResolvedExpenseFields,
  confidence: Record<string, number>,
): ResolvedExpense {
  // A credit card without a destination can only be a credit card expense
  const fields =
    !resolvedFields.destination && resolvedFields.creditCardId
      ? { ...resolvedFields, destination: ExpenseDestination.CREDIT_CARD }
      : resolvedFields

  const required = fields.destination
    ? REQUIRED_FIELDS_BY_DESTINATION[fields.destination as ExpenseDestination]
    : [ExpenseField.DESTINATION, ...BASE_REQUIRED_FIELDS]

  const missingFields = required.filter((field) => field !== ExpenseField.DESTINATION && fields[field] == null)
  if (!fields.destination) missingFields.unshift(ExpenseField.DESTINATION)

  const lowConfidenceFields = Object.entries(confidence)
    .filter(
      ([field, value]) => value < LOW_CONFIDENCE_THRESHOLD && fields[field as keyof ResolvedExpenseFields] != null,
    )
    .map(([field]) => field as ExpenseField)

  return { ...fields, confidence, missingFields, lowConfidenceFields }
}

// The AI reports confidence with its own keys (personRef…); store it with ExpenseFile field names (personId…)
const REF_TO_FIELD: Record<string, ExpenseField> = {
  personRef: ExpenseField.PERSON,
  paymentMethodRef: ExpenseField.PAYMENT_METHOD,
  creditCardRef: ExpenseField.CREDIT_CARD,
  categoryRef: ExpenseField.CATEGORY,
}

function toFieldConfidence(confidence: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(confidence).map(([key, value]) => [REF_TO_FIELD[key] ?? key, value]))
}
