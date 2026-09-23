import { Currency, ExpenseDestination, ExpenseType, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import { CatalogKind, ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { DateHelper } from '@/commons/helpers/date.helper'

import { matchCatalogEntry, normalizeText } from './expense-extraction.catalog'
import { ExtractionCatalog, ResolvedExpenseFields } from './dto/expense-extraction.types'

type Correction = Partial<ResolvedExpenseFields>

const NUMBER = '(\\d+(?:[.,]\\d{1,2})?)'

const PERIOD_WORDS: Record<string, SubscriptionPeriod> = {
  quincenal: SubscriptionPeriod.BIWEEKLY,
  mensual: SubscriptionPeriod.MONTHLY,
  trimestral: SubscriptionPeriod.QUARTERLY,
  semestral: SubscriptionPeriod.SEMIANNUAL,
  anual: SubscriptionPeriod.ANNUAL,
}

const DESTINATION_WORDS: Record<string, ExpenseDestination> = {
  'dia a dia': ExpenseDestination.DAILY,
  diario: ExpenseDestination.DAILY,
  'sin culpa': ExpenseDestination.DAILY,
  'costo fijo': ExpenseDestination.FIXED_COST,
  fijo: ExpenseDestination.FIXED_COST,
  plataforma: ExpenseDestination.SUBSCRIPTION,
  suscripcion: ExpenseDestination.SUBSCRIPTION,
  tarjeta: ExpenseDestination.CREDIT_CARD,
  'me debe': ExpenseDestination.RECEIVABLE,
  prestamo: ExpenseDestination.RECEIVABLE,
  'por cobrar': ExpenseDestination.RECEIVABLE,
}

const toNumber = (value: string) => Number(value.replace(',', '.'))

// Whole-word test on normalized text: punctuation counts as a boundary ("con culpa, ayer")
const hasWord = (text: string, words: string) => new RegExp(`(?:^|[^a-z0-9])(?:${words})(?:$|[^a-z0-9])`).test(text)

const findWord = <T>(text: string, words: Record<string, T>): T | null => {
  const key = Object.keys(words)
    .sort((a, b) => b.length - a.length)
    .find((word) => hasWord(text, word))
  return key ? words[key] : null
}

function parseAmount(text: string, bare: boolean): number | null {
  const patterns = [
    new RegExp(`monto\\s*:?\\s*${NUMBER}`),
    new RegExp(`(?:s\\/\\.?|\\$)\\s*${NUMBER}`),
    new RegExp(`${NUMBER}\\s*(?:soles|sol|dolares|usd|pen)\\b`),
    ...(bare ? [new RegExp(`^${NUMBER}$`)] : []),
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return toNumber(match[1])
  }
  return null
}

function parseInstallment(text: string, bare: boolean): string | null {
  const match =
    text.match(/cuota\s*(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})/) ??
    (bare ? text.match(/^(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})$/) : null)
  return match ? `${match[1]}/${match[2]}` : null
}

function parseDate(text: string, today: string): string | null {
  if (hasWord(text, 'hoy')) return today
  if (hasWord(text, 'ayer')) return DateHelper.addDays(today, -1)

  // "cuota 2/6" is an installment, not a date
  const withoutInstallment = text.replace(/cuota\s*\d{1,3}\s*(?:\/|de)\s*\d{1,3}/g, ' ')
  const match = withoutInstallment.match(/(?:^|[^0-9/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:$|[^0-9/])/)
  if (!match) return null

  const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : today.slice(0, 4)
  return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

function parseCurrency(text: string): Currency | null {
  if (hasWord(text, 'usd|dolares|dolar') || text.includes('$')) return Currency.USD
  if (hasWord(text, 'soles|sol|pen') || text.includes('s/')) return Currency.PEN
  return null
}

function parseExpenseType(text: string): ExpenseType | null {
  if (hasWord(text, 'con culpa|culpa|antojo')) return ExpenseType.GUILTY_PLEASURE
  if (hasWord(text, 'necesario|esencial')) return ExpenseType.ESSENTIAL
  return null
}

function withPaymentMethod(catalog: ExtractionCatalog, text: string): Correction | null {
  const method = matchCatalogEntry(catalog, CatalogKind.PAYMENT_METHOD, text)
  return method ? { paymentMethodId: method.id } : null
}

// Without a pending question, only messages that start with one of these words are corrections.
// "taxi 15 soles" is a new expense; "monto 15" corrects the open draft.
const CORRECTION_KEYWORDS = [
  'monto',
  'persona',
  'para',
  'cuota',
  'tarjeta',
  'pago',
  'pague',
  'con',
  'categoria',
  'concepto',
  'descripcion',
  'moneda',
  'fecha',
  'hoy',
  'ayer',
  'culpa',
  'antojo',
  'necesario',
  'esencial',
  'periodo',
  ...Object.keys(PERIOD_WORDS),
]

export function startsWithCorrectionKeyword(rawText: string): boolean {
  const firstWord = normalizeText(rawText).split(/[^a-z0-9]+/)[0]
  return CORRECTION_KEYWORDS.includes(firstWord)
}

// Answer to the question the bot asked: the whole message is the value of that field
function parsePendingField(
  field: ExpenseField,
  text: string,
  rawText: string,
  catalog: ExtractionCatalog,
  today: string,
): Correction | null {
  switch (field) {
    case ExpenseField.PERSON: {
      const person = matchCatalogEntry(catalog, CatalogKind.PERSON, text)
      return person ? { personId: person.id } : null
    }
    case ExpenseField.PAYMENT_METHOD:
      return withPaymentMethod(catalog, text)
    case ExpenseField.CATEGORY: {
      const category = matchCatalogEntry(catalog, CatalogKind.CATEGORY, text)
      return category ? { categoryId: category.id } : null
    }
    case ExpenseField.AMOUNT: {
      const amount = parseAmount(text, true)
      return amount ? { amount } : null
    }
    case ExpenseField.INSTALLMENT: {
      const installment = parseInstallment(text, true)
      return installment ? { installment } : null
    }
    case ExpenseField.PERIOD: {
      const period = findWord(text, PERIOD_WORDS)
      return period ? { period } : null
    }
    case ExpenseField.DESTINATION: {
      const destination = findWord(text, DESTINATION_WORDS)
      return destination ? { destination } : null
    }
    case ExpenseField.SPENT_AT: {
      const spentAt = parseDate(text, today)
      return spentAt ? { spentAt } : null
    }
    case ExpenseField.DESCRIPTION:
      return rawText.trim() ? { description: rawText.trim() } : null
    default:
      return null
  }
}

// Corrections while a draft is open, without calling the AI: the answer to the pending question, or keyword
// corrections ("persona Ana", "monto 30", "cuota 2/6"…) when the message starts with a keyword.
// Returns null when nothing was understood: the caller treats the message as a new expense.
export function parseCorrection(
  rawText: string,
  pendingField: ExpenseField | null,
  catalog: ExtractionCatalog,
  today: string,
): Correction | null {
  const text = normalizeText(rawText)
  if (!text) return null

  if (pendingField) {
    const answer = parsePendingField(pendingField, text, rawText, catalog, today)
    if (answer) return answer
  }

  // Anything else is a correction only when it starts with a keyword; otherwise it is a new expense
  if (!startsWithCorrectionKeyword(rawText)) return null

  const correction: Correction = {}

  const personMatch = text.match(/(?:^|\s)(?:persona|para)\s+(.+)/)
  const person = personMatch ? matchCatalogEntry(catalog, CatalogKind.PERSON, personMatch[1]) : null
  if (person) correction.personId = person.id

  const methodMatch = text.match(/(?:^|\s)(?:tarjeta|pago|pague con|con|medio)\s+(.+)/)
  if (methodMatch) Object.assign(correction, withPaymentMethod(catalog, methodMatch[1]))

  const categoryMatch = text.match(/(?:^|\s)categoria\s+(.+)/)
  const category = categoryMatch ? matchCatalogEntry(catalog, CatalogKind.CATEGORY, categoryMatch[1]) : null
  if (category) correction.categoryId = category.id

  const descriptionMatch = rawText.match(/(?:^|\s)(?:concepto|descripci[oó]n)\s*:?\s+(.+)/i)
  if (descriptionMatch) correction.description = descriptionMatch[1].trim()

  const amount = parseAmount(text, false)
  if (amount) correction.amount = amount

  const installment = parseInstallment(text, false)
  if (installment) correction.installment = installment

  const currency = parseCurrency(text)
  if (currency) correction.currency = currency

  const spentAt = parseDate(text, today)
  if (spentAt) correction.spentAt = spentAt

  const expenseType = parseExpenseType(text)
  if (expenseType) correction.expenseType = expenseType

  const period = findWord(text, PERIOD_WORDS)
  if (period) correction.period = period

  return Object.keys(correction).length ? correction : null
}
