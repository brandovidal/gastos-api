import { toCents } from '@/commons/constants/debt.constant'
import { Currency, ExpenseType, PaymentStatus, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import { normalizeText } from '@/modules/expense-extraction/expense-extraction.catalog'

// Values of the Notion boards (P14, D90) as the API stores them

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  setiembre: 9,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
}

const ENGLISH_MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
}

// "Setiembre" → 9
export const monthOf = (text: string): number | null => MONTHS[normalizeText(text)] ?? null

// "Setiembre 2026" or " Resumen Setiembre 2026" (title of a Resumen page) → { month: 9, year: 2026 }
export function monthYearOf(text: string): { month: number; year: number } | null {
  const normalized = normalizeText(text)
  const year = /\d{4}/.exec(normalized)
  const month = normalized
    .match(/[a-zñ]+/g)
    ?.map((word) => MONTHS[word])
    .find(Boolean)
  return year && month ? { month, year: Number(year[0]) } : null
}

// The year of a payment month next to a date: 2024-12-20 with January → 2025; 2025-01-05 with December → 2024
export function yearNear(month: number, isoDay: string | null): number | null {
  if (!isoDay) return null
  const year = Number(isoDay.slice(0, 4))
  const dayMonth = Number(isoDay.slice(5, 7))
  if (month - dayMonth > 6) return year - 1
  if (dayMonth - month > 6) return year + 1
  return year
}

// "1,042.00", "S/1,042.00", "S/ 29.90", "$12.50", "1042" → 1042; empty → null
export function moneyOf(text: string): number | null {
  const clean = text.replace(/[^\d.,-]/g, '')
  if (!clean) return null
  // "1.042,50" (comma as decimal) only when the comma comes last with 2 decimals
  const normalized =
    /,\d{1,2}$/.test(clean) && !/\.\d{1,2}$/.test(clean)
      ? clean.replace(/\./g, '').replace(',', '.')
      : clean.replace(/,/g, '')
  const value = Number(normalized)
  return Number.isFinite(value) ? toCents(value) : null
}

// "80%", "80", "0.8" → 80
export function percentOf(text: string): number | null {
  const value = moneyOf(text)
  if (value == null) return null
  return !text.includes('%') && value <= 1 ? toCents(value * 100) : value
}

const pad = (value: number) => String(value).padStart(2, '0')

// Notion exports dates as "19/09/2026" (the property format), "September 19, 2026" or ISO; ranges keep the start.
// Returns YYYY-MM-DD or null
export function dateOf(text: string): string | null {
  const value = text.split('→')[0].trim()
  if (!value) return null
  let match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value)
  if (match) return `${match[3]}-${pad(Number(match[2]))}-${pad(Number(match[1]))}`
  match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`
  match = /^([A-Za-z]+) (\d{1,2}), (\d{4})/.exec(value)
  const month = match ? ENGLISH_MONTHS[match[1].toLowerCase()] : undefined
  if (match && month) return `${match[3]}-${pad(month)}-${pad(Number(match[2]))}`
  return null
}

// "Soles(S/)" → PEN, "Dolares($)" → USD; empty → PEN (Cuentas has no currency)
export function currencyOf(text: string): Currency {
  return /dolar|\$|usd/i.test(text) && !/s\//i.test(text) ? Currency.USD : Currency.PEN
}

// "Gasto con culpa" → guilty pleasure; "Gasto fijo" or empty → essential
export const expenseTypeOf = (text: string) =>
  /culpa/i.test(text) ? ExpenseType.GUILTY_PLEASURE : ExpenseType.ESSENTIAL

// "3/10", "3 de 10", "3 / 10" → "3/10"; anything else → null
export function installmentOf(text: string): string | null {
  const match = /^(\d{1,3})\s*(?:\/|de)\s*(\d{1,3})$/i.exec(text.trim())
  return match && Number(match[1]) <= Number(match[2]) ? `${Number(match[1])}/${Number(match[2])}` : null
}

const STATUSES: Record<string, PaymentStatus> = {
  'no iniciado': PaymentStatus.NOT_STARTED,
  pendiente: PaymentStatus.PENDING,
  retrasado: PaymentStatus.PENDING,
  'parcialmente pagado': PaymentStatus.PARTIALLY_PAID,
  abonado: PaymentStatus.DEPOSITED,
  amortizado: PaymentStatus.AMORTIZED,
  pagado: PaymentStatus.PAID,
  exonerado: PaymentStatus.WAIVED,
  omitido: PaymentStatus.SKIPPED,
  cashback: PaymentStatus.CASHBACK,
  'no reconocido': PaymentStatus.SKIPPED, // IO: a charge the user did not recognize (claimed)
}

// "Estado de pago" of the boards; null when it is not a known status. Each table allows its own subset
export const paymentStatusOf = (text: string): PaymentStatus | null => STATUSES[normalizeText(text)] ?? null

const PERIODS: Record<string, SubscriptionPeriod> = {
  quincenal: SubscriptionPeriod.BIWEEKLY,
  mensual: SubscriptionPeriod.MONTHLY,
  trimestral: SubscriptionPeriod.QUARTERLY,
  semestral: SubscriptionPeriod.SEMIANNUAL,
  anual: SubscriptionPeriod.ANNUAL,
}

// "Periodo" of Plataformas; "Exonerado" is a status there, the period stays monthly
export const periodOf = (text: string): SubscriptionPeriod => PERIODS[normalizeText(text)] ?? SubscriptionPeriod.MONTHLY
