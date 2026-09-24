import { CatalogKind } from '@/commons/constants/expense-extraction.constant'
import { DebtDirection } from '@/commons/constants/debt.constant'
import {
  CREDIT_CARD_EXPENSE_STATUSES,
  Currency,
  FIXED_COST_STATUSES,
  PaymentStatus,
  SUBSCRIPTION_STATUSES,
} from '@/commons/constants/expense.constant'
import { findCatalogEntryByName, normalizeText } from '@/modules/expense-extraction/expense-extraction.catalog'
import { ExtractionCatalog } from '@/modules/expense-extraction/dto/expense-extraction.types'

import { CsvRow } from './notion-csv'
import {
  currencyOf,
  dateOf,
  expenseTypeOf,
  installmentOf,
  moneyOf,
  monthOf,
  monthYearOf,
  paymentStatusOf,
  percentOf,
  periodOf,
} from './notion.values'

// One Notion board (P14, D90) → rows of the API tables. Pure: the importer loads the catalog and saves.

export enum NotionBase {
  CARD = 'card',
  FIXED_COST = 'fixed_cost',
  SUBSCRIPTION = 'subscription',
  DEBT = 'debt',
  BUDGET_GROUP = 'budget_group',
  SUMMARY = 'summary',
}

export interface BaseFile {
  base: NotionBase
  card?: string // catalog code of the card board: CMR, OH, IO, AMEX
}

export type ImportTable = 'creditCardExpense' | 'fixedCost' | 'subscription' | 'debt'

export interface ExpenseImport {
  table: ImportTable
  fingerprint: string // what identifies the row (the importer adds the occurrence and hashes it into importKey)
  data: Record<string, unknown>
  paidInFull: { paidAt: Date } | null // a debt installment marked Pagado or Amortizado in Notion
  month: number
  year: number
  amount: number
  currency: string
  file: string
  line: number
}

export interface GroupImport {
  name: string
  percentage: number
}

export interface MonthlyBudgetImport {
  month: number
  year: number
  salary: number
  limitPercent: number
}

export interface ImportIssue {
  file: string
  line: number
  message: string
  blocking: boolean // the row is not imported until it is fixed (a name missing in the catalog, no amount…)
}

export type MappedRow =
  | { kind: 'expense'; value: ExpenseImport }
  | { kind: 'group'; value: GroupImport }
  | { kind: 'budget'; value: MonthlyBudgetImport }
  | { kind: 'issue'; value: ImportIssue }

export interface MapContext {
  catalog: ExtractionCatalog
  defaultPersonId: string
  defaultCategoryId: string | null
}

const CARD_CODES: Record<string, string> = { cmr: 'CMR', oh: 'OH', sip: 'OH', io: 'IO', amex: 'AMEX' }

// "💳 IO 28dbcadcbe2081…_all.csv" → { base: card, card: IO }; the headers decide when the name says nothing
export function detectBase(fileName: string, headers: string[]): BaseFile | null {
  const name = normalizeText(
    fileName
      .replace(/\.csv$/i, '')
      .replace(/[0-9a-f]{32}/gi, ' ')
      .replace(/_all$/i, ''),
  )
    .replace(/[^a-z0-9 ]/g, ' ')
    .trim()
  const words = name.split(/\s+/)

  if (name.includes('costos fijos')) return { base: NotionBase.FIXED_COST }
  if (name.includes('plataformas')) return { base: NotionBase.SUBSCRIPTION }
  if (name.includes('relacion de gastos')) return { base: NotionBase.BUDGET_GROUP }
  if (name.includes('resumen')) return { base: NotionBase.SUMMARY }
  if (words.includes('cuentas')) return { base: NotionBase.DEBT }
  const card = words.find((word) => CARD_CODES[word])
  if (card) return { base: NotionBase.CARD, card: CARD_CODES[card] }

  if (headers.includes('Sueldo')) return { base: NotionBase.SUMMARY }
  if (headers.includes('Porcentaje (%)')) return { base: NotionBase.BUDGET_GROUP }
  if (headers.includes('Periodo') && headers.includes('Monto')) return { base: NotionBase.SUBSCRIPTION }
  if (headers.includes('Fecha atencion')) return { base: NotionBase.FIXED_COST }
  return null
}

const day = (isoDay: string | null) => (isoDay ? new Date(`${isoDay}T00:00:00.000Z`) : null)

// Only the statuses the table allows; the rest fall to the closest one
function statusFor(text: string, allowed: readonly PaymentStatus[], fallback: PaymentStatus): PaymentStatus {
  const status = paymentStatusOf(text)
  if (!status) return fallback
  if (allowed.includes(status)) return status
  if (status === PaymentStatus.AMORTIZED || status === PaymentStatus.DEPOSITED) {
    return allowed.includes(PaymentStatus.PAID) ? PaymentStatus.PAID : fallback
  }
  if (status === PaymentStatus.PARTIALLY_PAID) return PaymentStatus.PENDING
  return fallback
}

const joinNotes = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || null

export function mapRow(source: BaseFile, file: string, row: CsvRow, context: MapContext): MappedRow[] {
  const value = (column: string) => row.values[column] ?? ''
  const issues: MappedRow[] = []
  const issue = (message: string, blocking = true) =>
    issues.push({ kind: 'issue', value: { file, line: row.line, message, blocking } })

  if (source.base === NotionBase.BUDGET_GROUP) {
    const name = value('Nombre')
    const percentage = percentOf(value('Porcentaje (%)'))
    if (!name || percentage == null)
      return [
        { kind: 'issue', value: { file, line: row.line, message: 'grupo sin nombre o porcentaje', blocking: true } },
      ]
    return [{ kind: 'group', value: { name, percentage } }]
  }

  if (source.base === NotionBase.SUMMARY) {
    const period = monthYearOf(value('Descripción'))
    const salary = moneyOf(value('Sueldo'))
    if (!period || salary == null) {
      return [
        {
          kind: 'issue',
          value: {
            file,
            line: row.line,
            message: `resumen sin mes o sueldo: «${value('Descripción')}»`,
            blocking: true,
          },
        },
      ]
    }
    return [{ kind: 'budget', value: { ...period, salary, limitPercent: percentOf(value('Porcentaje')) ?? 100 } }]
  }

  // Every expense board: description, amount, payment month and year
  const description = value('Descripción')
  const amount = moneyOf(value(source.base === NotionBase.SUBSCRIPTION ? 'Monto' : 'Pago'))
  const month = monthOf(value('Mes de pago'))
  const year = Number(value('Año de pago')) || null
  if (!description) issue('sin descripción')
  if (amount == null || amount === 0) issue(`sin monto: «${description}»`)
  if (!month || !year) issue(`sin mes o año de pago: «${description}»`)

  const person = (name: string) => {
    if (!name) return context.defaultPersonId
    const entry = findCatalogEntryByName(context.catalog, CatalogKind.PERSON, name)
    if (!entry) issue(`persona «${name}» no está en el catálogo`)
    return entry?.id ?? null
  }
  const method = (name: string) => {
    if (!name) return null
    const entry = findCatalogEntryByName(context.catalog, CatalogKind.PAYMENT_METHOD, name)
    if (!entry) issue(`cuenta «${name}» no está en el catálogo`)
    return entry?.id ?? null
  }
  const cuota = value(source.base === NotionBase.FIXED_COST ? 'Cuotas' : 'Cuota')
  const installment = installmentOf(cuota)
  const oddInstallment = cuota && !installment ? `Cuota: ${cuota}` : null

  let table: ImportTable
  let data: Record<string, unknown>
  let paidInFull: ExpenseImport['paidInFull'] = null
  let dateKey: string | null = null
  const currency =
    source.base === NotionBase.DEBT || source.base === NotionBase.SUBSCRIPTION
      ? Currency.PEN
      : currencyOf(value('Moneda'))
  const money = { description, amount, currency, amountInPen: currency === Currency.PEN ? amount : null }

  switch (source.base) {
    case NotionBase.CARD: {
      const card = findCatalogEntryByName(context.catalog, CatalogKind.PAYMENT_METHOD, source.card!.toLowerCase())
      if (!card) issue(`tarjeta ${source.card} no está en el catálogo`)
      dateKey = dateOf(value('Fecha proceso'))
      table = 'creditCardExpense'
      data = {
        ...money,
        expenseType: expenseTypeOf(value('Tipo')),
        paymentStatus: statusFor(value('Estado de pago'), CREDIT_CARD_EXPENSE_STATUSES, PaymentStatus.PENDING),
        personId: person(value('Persona')),
        paymentMethodId: card?.id ?? null,
        installment,
        paymentMonth: month,
        paymentYear: year,
        processDate: day(dateKey),
        notes: joinNotes(value('Observacion'), oddInstallment),
      }
      break
    }
    case NotionBase.FIXED_COST: {
      const categoryName = value('Categoria')
      const category = categoryName ? findCatalogEntryByName(context.catalog, CatalogKind.CATEGORY, categoryName) : null
      if (categoryName && !category) issue(`categoría «${categoryName}» no está en el catálogo`)
      const categoryId = category?.id ?? (categoryName ? null : context.defaultCategoryId)
      if (!categoryName && !categoryId)
        issue(`costo fijo sin categoría y no hay categoría por defecto: «${description}»`)
      dateKey = dateOf(value('Fecha limite'))
      table = 'fixedCost'
      data = {
        ...money,
        paymentStatus: statusFor(value('Estado de pago'), FIXED_COST_STATUSES, PaymentStatus.NOT_STARTED),
        personId: person(value('Persona')),
        categoryId,
        paymentMethodId: method(value('Cuenta')),
        installment,
        paymentMonth: month,
        paymentYear: year,
        paymentDate: day(dateOf(value('Fecha pago'))),
        dueDate: day(dateKey),
        attentionDate: day(dateOf(value('Fecha atencion'))),
        notes: joinNotes(value('Observacion'), oddInstallment),
      }
      break
    }
    case NotionBase.SUBSCRIPTION: {
      // Persona is "Personal" or "Compartido" there, not a person: always the owner
      const waived = normalizeText(value('Periodo')) === 'exonerado'
      dateKey = dateOf(value('Fecha limite'))
      table = 'subscription'
      data = {
        ...money,
        paymentStatus: waived
          ? PaymentStatus.WAIVED
          : statusFor(value('Estado de pago'), SUBSCRIPTION_STATUSES, PaymentStatus.NOT_STARTED),
        period: periodOf(value('Periodo')),
        personId: context.defaultPersonId,
        paymentMethodId: method(value('Cuenta')),
        paymentMonth: month,
        paymentYear: year,
        paymentDate: day(dateOf(value('Fecha pago'))),
        dueDate: day(dateKey),
        notes: joinNotes(value('Comentario'), /compartido/i.test(value('Persona')) ? 'Compartido (Notion)' : null),
      }
      break
    }
    case NotionBase.DEBT: {
      if (!value('Persona')) issue(`cuenta sin persona: «${description}»`)
      const status = paymentStatusOf(value('Estado de pago'))
      dateKey = dateOf(value('Fecha limite'))
      const paidDay = dateOf(value('Fecha pago')) ?? dateKey
      if (status === PaymentStatus.PAID || status === PaymentStatus.AMORTIZED) {
        paidInFull = { paidAt: day(paidDay) ?? new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1, 1)) }
      }
      if (status === PaymentStatus.PARTIALLY_PAID || status === PaymentStatus.DEPOSITED) {
        issue(
          `«${description}» figura abonada en Notion sin monto: queda pendiente; registra el abono en la web`,
          false,
        )
      }
      table = 'debt'
      data = {
        direction: DebtDirection.OWED_TO_ME,
        ...money,
        personId: value('Persona') ? person(value('Persona')) : null,
        installment,
        paymentMonth: month,
        paymentYear: year,
        dueDate: day(dateKey),
        notes: joinNotes(value('Comentarios'), oddInstallment),
      }
      break
    }
  }

  if (issues.some((mapped) => mapped.kind === 'issue' && mapped.value.blocking)) return issues

  const fingerprint = [
    table!,
    source.card ?? '',
    normalizeText(description),
    amount,
    currency,
    `${year}-${month}`,
    data!.personId,
    installment ?? '',
    dateKey ?? '',
  ].join('|')

  return [
    ...issues,
    {
      kind: 'expense',
      value: {
        table: table!,
        fingerprint,
        data: data!,
        paidInFull,
        month: month!,
        year: year!,
        amount: amount!,
        currency,
        file,
        line: row.line,
      },
    },
  ]
}
