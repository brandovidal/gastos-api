// User-facing texts are in Spanish (D11): everything else in this file is English.
import { BotAction, MAX_QUICK_REPLIES, QUICK_REPLIES_PER_ROW } from '@/commons/constants/conversation.constant'
import { Currency, ExpenseDestination, ExpenseType, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import { CatalogKind, ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { ExpenseFileDbDto } from '@/db/models/expense-file/expenseFileDB.dto'
import { MonthlyTotalDbDto } from '@/db/models/expense/expenseDB.dto'
import { findCatalogEntryById } from '@/modules/expense-extraction/expense-extraction.catalog'
import { ExtractionCatalog } from '@/modules/expense-extraction/dto/expense-extraction.types'

import { encodeBotAction } from './bot-action.codec'
import { lowConfidenceFieldsOf } from './expense-file.mapper'
import { BotButton, BotReply } from './dto/conversation.types'

export const DESTINATION_LABELS: Record<ExpenseDestination, string> = {
  [ExpenseDestination.FIXED_COST]: 'Costo fijo',
  [ExpenseDestination.SUBSCRIPTION]: 'Plataforma',
  [ExpenseDestination.CREDIT_CARD]: 'Tarjeta',
  [ExpenseDestination.RECEIVABLE]: 'Me deben',
  [ExpenseDestination.DISCARD]: 'No es gasto',
}

const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  [ExpenseType.ESSENTIAL]: 'Esencial',
  [ExpenseType.GUILTY_PLEASURE]: 'Con culpa',
}

const PERIOD_LABELS: Record<SubscriptionPeriod, string> = {
  [SubscriptionPeriod.BIWEEKLY]: 'Quincenal',
  [SubscriptionPeriod.MONTHLY]: 'Mensual',
  [SubscriptionPeriod.QUARTERLY]: 'Trimestral',
  [SubscriptionPeriod.SEMIANNUAL]: 'Semestral',
  [SubscriptionPeriod.ANNUAL]: 'Anual',
}

export const TEXTS = {
  help: [
    '👋 Escríbeme tus gastos y los registro.',
    '',
    '<b>Ejemplos</b>',
    '• almuerzo 25 soles con yape',
    '• netflix 45 mensual con la oh',
    '• le presté 100 a dany',
    '• uber 18.50 ayer, cuota 1/3 con io',
    '',
    '<b>Para corregir</b> un gasto que acabo de leer, empieza con la palabra: <i>monto 30</i>, <i>persona dany</i>, <i>cuota 2/6</i>, <i>tarjeta oh</i>, <i>categoría comida</i>, <i>con culpa</i>, <i>ayer</i>. Si no, toca ✏️ Corregir y escríbelo como quieras.',
    '',
    '/ultimos · /resumen · /cancelar',
  ].join('\n'),
  failed: '⚠️ No pude procesar el mensaje ahora. Lo dejé en la bandeja para revisarlo en la web.',
  notAnExpense: '🤔 No encontré un gasto en tu mensaje. Prueba con algo como <i>almuerzo 25 soles con yape</i>.',
  askCorrection: '✏️ Escribe la corrección como quieras (ej: <i>eran 30 soles y fue con la oh</i>).',
  correctionFailed: '⚠️ No pude aplicar la corrección. Prueba con <i>monto 30</i> o <i>persona dany</i>.',
  alreadyProcessed: 'Este gasto ya fue procesado',
  saved: 'Guardado',
  cancelled: (count: number) => (count ? '🗑️ Descarté el borrador abierto.' : 'No hay ningún borrador abierto.'),
  noRecent: 'Todavía no guardaste gastos desde aquí.',
  noTotals: 'No hay gastos registrados este mes.',
}

const QUESTIONS: Partial<Record<ExpenseField, string>> = {
  [ExpenseField.DESTINATION]: '¿Qué tipo de gasto es?',
  [ExpenseField.DESCRIPTION]: '¿Cuál es el concepto? (ej: <i>Almuerzo</i>, <i>Netflix</i>)',
  [ExpenseField.AMOUNT]: '¿Cuánto fue? (ej: <i>25.50</i>)',
  [ExpenseField.CATEGORY]: '¿Qué categoría?',
  [ExpenseField.PAYMENT_METHOD]: '¿Con qué pagaste?',
  [ExpenseField.CREDIT_CARD]: '¿Con qué tarjeta?',
  [ExpenseField.PERIOD]: '¿Cada cuánto se paga?',
}

export const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function formatAmount(amount: number | null, currency: string | null): string {
  if (amount == null) return '—'
  const symbol = currency === Currency.USD ? 'US$' : 'S/'
  return `${symbol} ${amount.toFixed(2)}`
}

const formatDate = (date: Date | null) => (date ? date.toISOString().slice(0, 10).split('-').reverse().join('/') : '—')

const nameOf = (catalog: ExtractionCatalog, id: string | null) =>
  escapeHtml(findCatalogEntryById(catalog, id)?.name ?? '—')

export function formatSummary(expenseFile: ExpenseFileDbDto, catalog: ExtractionCatalog): string {
  const doubtful = new Set(lowConfidenceFieldsOf(expenseFile))
  const mark = (field: ExpenseField) => (doubtful.has(field) ? ' ❓' : '')

  const payment = expenseFile.creditCardId
    ? `💳 ${nameOf(catalog, expenseFile.creditCardId)}${mark(ExpenseField.CREDIT_CARD)}`
    : `💳 ${nameOf(catalog, expenseFile.paymentMethodId)}${mark(ExpenseField.PAYMENT_METHOD)}`

  const details = [
    formatDate(expenseFile.spentAt),
    expenseFile.destination ? DESTINATION_LABELS[expenseFile.destination as ExpenseDestination] : null,
    expenseFile.expenseType ? EXPENSE_TYPE_LABELS[expenseFile.expenseType as ExpenseType] : null,
    expenseFile.period ? PERIOD_LABELS[expenseFile.period as SubscriptionPeriod] : null,
    expenseFile.installment ? `Cuota ${expenseFile.installment}` : null,
  ].filter(Boolean)

  return [
    `🧾 <b>${escapeHtml(expenseFile.description ?? 'Sin concepto')}</b>${mark(ExpenseField.DESCRIPTION)} — ${formatAmount(expenseFile.amount, expenseFile.currency)}${mark(ExpenseField.AMOUNT)}`,
    `👤 ${nameOf(catalog, expenseFile.personId)}${mark(ExpenseField.PERSON)}   ${payment}   📂 ${nameOf(catalog, expenseFile.categoryId)}${mark(ExpenseField.CATEGORY)}`,
    `📅 ${details.join(' · ')}`,
  ].join('\n')
}

const button = (label: string, name: BotAction, expenseFileId: string, field?: string, value?: string): BotButton => ({
  label,
  data: encodeBotAction({ name, expenseFileId, field, value }),
})

const toRows = (buttons: BotButton[]) =>
  buttons.reduce<BotButton[][]>((rows, current, index) => {
    if (index % QUICK_REPLIES_PER_ROW === 0) rows.push([])
    rows[rows.length - 1].push(current)
    return rows
  }, [])

function quickReplies(field: ExpenseField, expenseFileId: string, catalog: ExtractionCatalog): BotButton[] {
  const set = (label: string, value: string) => button(label, BotAction.SET_FIELD, expenseFileId, field, value)
  const fromCatalog = (kind: CatalogKind) =>
    catalog.entries
      .filter((entry) => entry.kind === kind)
      .slice(0, MAX_QUICK_REPLIES)
      .map((entry) => set(entry.name, entry.id))

  switch (field) {
    case ExpenseField.DESTINATION:
      return Object.values(ExpenseDestination)
        .filter((destination) => destination !== ExpenseDestination.DISCARD)
        .map((destination) => set(DESTINATION_LABELS[destination], destination))
    case ExpenseField.PERIOD:
      return Object.values(SubscriptionPeriod).map((period) => set(PERIOD_LABELS[period], period))
    case ExpenseField.PAYMENT_METHOD:
      return fromCatalog(CatalogKind.PAYMENT_METHOD)
    case ExpenseField.CREDIT_CARD:
      return fromCatalog(CatalogKind.CREDIT_CARD)
    case ExpenseField.CATEGORY:
      return fromCatalog(CatalogKind.CATEGORY)
    default:
      return []
  }
}

// Summary plus the next question (draft) or the confirmation buttons (awaiting_confirmation)
export function buildExpenseReply(expenseFile: ExpenseFileDbDto, catalog: ExtractionCatalog, edit = false): BotReply {
  const summary = formatSummary(expenseFile, catalog)
  const field = expenseFile.pendingField as ExpenseField | null

  if (field && QUESTIONS[field]) {
    const replies = quickReplies(field, expenseFile.id, catalog)
    return {
      text: `${summary}\n\n${QUESTIONS[field]}`,
      buttons: [...toRows(replies), [button('❌ Descartar', BotAction.DISCARD, expenseFile.id)]],
      edit,
    }
  }

  return {
    text: summary,
    buttons: [
      [button('✅ Guardar', BotAction.SAVE, expenseFile.id), button('✏️ Corregir', BotAction.EDIT, expenseFile.id)],
      [
        button('📥 Bandeja', BotAction.INBOX, expenseFile.id),
        button('❌ Descartar', BotAction.DISCARD, expenseFile.id),
      ],
    ],
    edit,
  }
}

// Final state of an expense: same summary, no buttons
export function buildClosedReply(prefix: string, expenseFile: ExpenseFileDbDto, catalog: ExtractionCatalog): BotReply {
  return { text: `${prefix}\n${formatSummary(expenseFile, catalog)}`, edit: true }
}

export function formatRecent(expenseFiles: ExpenseFileDbDto[]): string {
  if (!expenseFiles.length) return TEXTS.noRecent

  return [
    '<b>Últimos gastos</b>',
    ...expenseFiles.map(
      (expenseFile) =>
        `• ${formatDate(expenseFile.spentAt)} ${escapeHtml(expenseFile.description ?? '—')} — ${formatAmount(expenseFile.amount, expenseFile.currency)} (${DESTINATION_LABELS[expenseFile.destination as ExpenseDestination] ?? '—'})`,
    ),
  ].join('\n')
}

export function formatMonthlyTotals(
  totals: MonthlyTotalDbDto[],
  catalog: ExtractionCatalog,
  monthLabel: string,
): string {
  if (!totals.length) return TEXTS.noTotals

  const sum = (rows: MonthlyTotalDbDto[]) => {
    const byCurrency = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.currency] = (acc[row.currency] ?? 0) + row.total
      return acc
    }, {})
    return Object.entries(byCurrency)
      .map(([currency, total]) => formatAmount(total, currency))
      .join(' + ')
  }

  const destinations = [...new Set(totals.map((row) => row.destination))]
  const people = [
    ...new Set(totals.filter((row) => row.destination !== ExpenseDestination.RECEIVABLE).map((row) => row.personId)),
  ]

  return [
    `<b>Resumen de ${monthLabel}</b>`,
    ...destinations.map((destination) => {
      const label =
        destination === ExpenseDestination.RECEIVABLE ? 'Me deben (pendiente)' : DESTINATION_LABELS[destination]
      return `• ${label}: ${sum(totals.filter((row) => row.destination === destination))}`
    }),
    '',
    '<b>Por persona</b>',
    ...people.map(
      (personId) =>
        `• ${nameOf(catalog, personId)}: ${sum(totals.filter((row) => row.personId === personId && row.destination !== ExpenseDestination.RECEIVABLE))}`,
    ),
  ].join('\n')
}
