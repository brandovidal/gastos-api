// User-facing texts are in Spanish (D11): everything else in this file is English.
import {
  BotAction,
  MAX_NEW_PAYMENT_METHOD_NAME_BYTES,
  MAX_QUICK_REPLIES,
  QUICK_REPLIES_PER_ROW,
} from '@/commons/constants/conversation.constant'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { ExpenseDraftStatus } from '@/commons/constants/expense-draft.constant'
import {
  Currency,
  DEBT_DESTINATIONS,
  ExpenseDestination,
  ExpenseType,
  SubscriptionPeriod,
} from '@/commons/constants/expense.constant'
import { CatalogKind, ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { ExpenseDraftDbDto } from '@/db/models/expense-draft/expenseDraftDB.dto'
import { MonthlyTotalDbDto } from '@/db/models/expense/expenseDB.dto'
import { botPaymentMethods, findCatalogEntryById } from '@/modules/expense-extraction/expense-extraction.catalog'
import { AiModelUsage, ExtractionCatalog } from '@/modules/expense-extraction/dto/expense-extraction.types'

import { encodeBotAction } from './bot-action.codec'
import { lowConfidenceFieldsOf } from './expense-draft.mapper'
import { BotButton, BotReply } from './dto/conversation.types'

export const DESTINATION_LABELS: Record<ExpenseDestination, string> = {
  [ExpenseDestination.DAILY]: 'Día a día',
  [ExpenseDestination.FIXED_COST]: 'Costo fijo',
  [ExpenseDestination.SUBSCRIPTION]: 'Plataforma',
  [ExpenseDestination.CREDIT_CARD]: 'Tarjeta',
  [ExpenseDestination.RECEIVABLE]: 'Me deben',
  [ExpenseDestination.PAYABLE]: 'Le debo',
  [ExpenseDestination.DISCARD]: 'No es gasto',
}

const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  [ExpenseType.ESSENTIAL]: 'Esencial',
  [ExpenseType.GUILTY_PLEASURE]: 'Con culpa',
}

const PAYMENT_TYPE_LABELS: Record<PaymentMethodType, string> = {
  [PaymentMethodType.DEBIT_CARD]: 'Débito',
  [PaymentMethodType.WALLET]: 'Billetera',
  [PaymentMethodType.CREDIT_CARD]: 'Tarjeta de crédito',
  [PaymentMethodType.CASH]: 'Efectivo',
  [PaymentMethodType.BANK_TRANSFER]: 'Transferencia',
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
    '• uber 18.50 ayer en efectivo',
    '• netflix 45 mensual con la oh',
    '• zapatillas 300 con io en 3 cuotas',
    '• le presté 100 a dany',
    '• 📸 una captura de Yape o Plin, o la foto de un voucher (con texto opcional: <i>persona dany</i>)',
    '• 🎙️ una nota de voz: <i>"almuerzo veinticinco soles con yape"</i>',
    '',
    '<b>Para corregir</b> un gasto que acabo de leer, empieza con la palabra: <i>monto 30</i>, <i>persona dany</i>, <i>cuota 2/6</i>, <i>tarjeta oh</i>, <i>categoría comida</i>, <i>con culpa</i>, <i>ayer</i>. Si no, toca ✏️ Corregir y escríbelo como quieras.',
    '',
    '/borrador · /ultimos · /resumen · /uso · /cancelar',
  ].join('\n'),
  failed: '⚠️ No pude procesar el mensaje ahora. Lo dejé en /borrador para reintentarlo.',
  interrupted: (count: number) =>
    count === 1
      ? '⚠️ Me reinicié mientras procesaba un mensaje. Lo dejé en /borrador para retomarlo.'
      : `⚠️ Me reinicié mientras procesaba ${count} mensajes. Los dejé en /borrador para retomarlos.`,
  audioTooLong: (maxSeconds: number) => `🎙️ El audio es muy largo. Mándame uno de hasta ${maxSeconds} segundos.`,
  emptyAudio: '🎙️ No entendí el audio. Prueba de nuevo o escríbelo.',
  heard: (transcript: string) => `🎙️ Entendí: <i>«${escapeHtml(transcript)}»</i>`,
  duplicateAudio: '🎙️ Ya recibí este audio antes. Búscalo en /ultimos o /borrador.',
  fileExpired: '📎 La captura ya expiró (7 días). Mándala otra vez.',
  duplicateImage: '🖼️ Ya recibí esta imagen antes. Búscala en /ultimos o /borrador.',
  imageTooLarge: '🖼️ La imagen pesa demasiado. Envíala como foto (no como archivo) o una captura más liviana.',
  // Two overlapping screenshots with the same movement (P21)
  possibleRepeat: (concept: string, amount: string, date: string) =>
    `⚠️ Parece repetido: ya hay <b>${escapeHtml(concept)}</b> de ${amount} con esa tarjeta el ${date}.`,
  possibleDuplicate: (operationNumber: string) =>
    `⚠️ Parece que ya registraste este gasto (operación <b>${escapeHtml(operationNumber)}</b>).`,
  notAnExpense: '🤔 No encontré un gasto en tu mensaje. Prueba con algo como <i>almuerzo 25 soles con yape</i>.',
  askCorrection: '✏️ Escribe la corrección como quieras (ej: <i>eran 30 soles y fue con la oh</i>).',
  correctionFailed: '⚠️ No pude aplicar la corrección. Prueba con <i>monto 30</i> o <i>persona dany</i>.',
  alreadyProcessed: 'Este gasto ya fue procesado',
  saved: 'Guardado',
  cancelled: (count: number) => (count ? '🗑️ Descarté el borrador abierto.' : 'No hay ningún borrador abierto.'),
  noRecent: 'Todavía no guardaste gastos desde aquí.',
  noTotals: 'No hay gastos registrados este mes.',
  emptyDrafts: '📝 No hay nada pendiente en Borrador.',
  draftsHeader: (shown: number, total: number) =>
    `📝 <b>Borrador</b> (${total})${total > shown ? ` · mostrando los ${shown} más recientes` : ''}`,
  resumed: 'Retomado',
  failedExtraction: '(la AI no pudo leerlo)',
  askCardDays:
    '💳 ¿Qué día cierra la facturación y qué día vence el pago? (ej: <i>cierre 15, pago 5</i> o <i>15 5</i>)',
  cardDaysSaved: (name: string) => `✅ Guardé los días de <b>${escapeHtml(name)}</b>.`,
  cardDaysInvalid: 'No entendí los días. Escribe dos números del 1 al 31, por ejemplo <i>cierre 15, pago 5</i>.',
  paymentMethodCreated: (name: string) => `✅ Agregué <b>${escapeHtml(name)}</b> a tus medios de pago.`,
  paymentMethodNotAdded: 'Listo, no lo agregué. Elige uno de la lista o escríbelo de nuevo.',
  batchSaved: (saved: number, parked: number) =>
    [
      saved ? `✅ Guardé ${saved} ${saved === 1 ? 'gasto' : 'gastos'}.` : null,
      parked ? `📝 ${parked} ${parked === 1 ? 'quedó' : 'quedaron'} en /borrador (repetidos o incompletos).` : null,
      'Ver: /ultimos · /resumen',
    ]
      .filter(Boolean)
      .join('\n'),
  batchParked: (count: number) => `📝 Dejé ${count} gastos en /borrador. Retómalos cuando quieras.`,
  batchReview: '👇 Revisa cada uno:',
}

// "❓ falta categoría" in the list of screenshots
const FIELD_NAMES: Partial<Record<ExpenseField, string>> = {
  [ExpenseField.DESTINATION]: 'destino',
  [ExpenseField.DESCRIPTION]: 'concepto',
  [ExpenseField.AMOUNT]: 'monto',
  [ExpenseField.PERSON]: 'persona',
  [ExpenseField.PAYMENT_METHOD]: 'medio de pago',
  [ExpenseField.CATEGORY]: 'categoría',
  [ExpenseField.PERIOD]: 'período',
}

const QUESTIONS: Partial<Record<ExpenseField, string>> = {
  [ExpenseField.DESTINATION]: '¿Qué tipo de gasto es?',
  [ExpenseField.DESCRIPTION]: '¿Cuál es el concepto? (ej: <i>Almuerzo</i>, <i>Netflix</i>)',
  [ExpenseField.AMOUNT]: '¿Cuánto fue? (ej: <i>25.50</i>)',
  [ExpenseField.CATEGORY]: '¿Qué categoría?',
  [ExpenseField.PAYMENT_METHOD]: '¿Con qué pagaste? (elige o escríbelo)',
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

export function formatSummary(expenseDraft: ExpenseDraftDbDto, catalog: ExtractionCatalog): string {
  const doubtful = new Set(lowConfidenceFieldsOf(expenseDraft))
  const mark = (field: ExpenseField) => (doubtful.has(field) ? ' ❓' : '')

  const payment = `💳 ${nameOf(catalog, expenseDraft.paymentMethodId)}${mark(ExpenseField.PAYMENT_METHOD)}`

  const details = [
    formatDate(expenseDraft.spentAt),
    expenseDraft.destination ? DESTINATION_LABELS[expenseDraft.destination as ExpenseDestination] : null,
    expenseDraft.expenseType ? EXPENSE_TYPE_LABELS[expenseDraft.expenseType as ExpenseType] : null,
    expenseDraft.period ? PERIOD_LABELS[expenseDraft.period as SubscriptionPeriod] : null,
    expenseDraft.installment ? `Cuota ${expenseDraft.installment}` : null,
  ].filter(Boolean)

  return [
    `🧾 <b>${escapeHtml(expenseDraft.description ?? 'Sin concepto')}</b>${mark(ExpenseField.DESCRIPTION)} — ${formatAmount(expenseDraft.amount, expenseDraft.currency)}${mark(ExpenseField.AMOUNT)}`,
    `👤 ${nameOf(catalog, expenseDraft.personId)}${mark(ExpenseField.PERSON)}   ${payment}   📂 ${nameOf(catalog, expenseDraft.categoryId)}${mark(ExpenseField.CATEGORY)}`,
    `📅 ${details.join(' · ')}`,
  ].join('\n')
}

const button = (label: string, name: BotAction, draftId: string, field?: string, value?: string): BotButton => ({
  label,
  data: encodeBotAction({ name, draftId, field, value }),
})

const toRows = (buttons: BotButton[]) =>
  buttons.reduce<BotButton[][]>((rows, current, index) => {
    if (index % QUICK_REPLIES_PER_ROW === 0) rows.push([])
    rows[rows.length - 1].push(current)
    return rows
  }, [])

function quickReplies(field: ExpenseField, draftId: string, catalog: ExtractionCatalog): BotButton[] {
  const set = (label: string, value: string) => button(label, BotAction.SET_FIELD, draftId, field, value)
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
      return botPaymentMethods(catalog)
        .slice(0, MAX_QUICK_REPLIES)
        .map((entry) => set(entry.name, entry.id))
    case ExpenseField.CATEGORY:
      return fromCatalog(CatalogKind.CATEGORY)
    default:
      return []
  }
}

// Summary plus the next question (draft) or the confirmation buttons (awaiting_confirmation)
export function buildExpenseReply(expenseDraft: ExpenseDraftDbDto, catalog: ExtractionCatalog, edit = false): BotReply {
  const summary = formatSummary(expenseDraft, catalog)
  const field = expenseDraft.pendingField as ExpenseField | null

  if (field && QUESTIONS[field]) {
    const replies = quickReplies(field, expenseDraft.id, catalog)
    return {
      text: `${summary}\n\n${QUESTIONS[field]}`,
      buttons: [...toRows(replies), [button('❌ Descartar', BotAction.DISCARD, expenseDraft.id)]],
      edit,
    }
  }

  return {
    text: summary,
    buttons: [
      [button('✅ Guardar', BotAction.SAVE, expenseDraft.id), button('✏️ Corregir', BotAction.EDIT, expenseDraft.id)],
      [
        button('📝 Borrador', BotAction.LATER, expenseDraft.id),
        button('❌ Descartar', BotAction.DISCARD, expenseDraft.id),
      ],
    ],
    edit,
  }
}

// Final state of an expense: same summary, no buttons
export function buildClosedReply(
  prefix: string,
  expenseDraft: ExpenseDraftDbDto,
  catalog: ExtractionCatalog,
): BotReply {
  return { text: `${prefix}\n${formatSummary(expenseDraft, catalog)}`, edit: true }
}

// A new message after ✅ Guardar / 📝 Borrador: the summary is edited in place (no notification), this one arrives at
// the end of the chat
export function buildSavedNotice(expenseDraft: ExpenseDraftDbDto, destinationLabel: string): BotReply {
  return {
    text: `✅ Guardado: ${conceptOf(expenseDraft)} en ${destinationLabel}.\nVer: /ultimos · /resumen`,
  }
}

export function buildParkedNotice(expenseDraft: ExpenseDraftDbDto): BotReply {
  return { text: `📝 Quedó en /borrador: ${conceptOf(expenseDraft)}. Retómalo cuando quieras.` }
}

const conceptOf = ({ description, amount, currency }: ExpenseDraftDbDto) =>
  `${escapeHtml(description ?? 'Gasto')} ${formatAmount(amount, currency)}`

// Several screenshots or movements at once (P21): one list instead of one summary per expense
export function buildBatchReply(
  batchId: string,
  expenseDrafts: ExpenseDraftDbDto[],
  warnings: (string | null)[],
  catalog: ExtractionCatalog,
): BotReply {
  const totals = new Map<string, number>()
  for (const { amount, currency } of expenseDrafts) {
    if (amount == null) continue
    const key = currency ?? Currency.PEN
    totals.set(key, (totals.get(key) ?? 0) + amount)
  }
  const total = [...totals].map(([currency, amount]) => formatAmount(Math.round(amount * 100) / 100, currency))

  const lines = expenseDrafts.map((expenseDraft, index) => {
    const details = [
      formatDate(expenseDraft.spentAt).slice(0, 5),
      `<b>${escapeHtml(expenseDraft.description ?? 'Sin concepto')}</b>`,
      formatAmount(expenseDraft.amount, expenseDraft.currency),
      expenseDraft.installment ? `cuota ${expenseDraft.installment}` : null,
      expenseDraft.paymentMethodId ? nameOf(catalog, expenseDraft.paymentMethodId) : null,
    ].filter(Boolean)
    const flag = warnings[index]
      ? ' ⚠️ repetido'
      : expenseDraft.missingFields.length
        ? ` ❓ falta ${expenseDraft.missingFields.map((field) => FIELD_NAMES[field as ExpenseField] ?? field).join(', ')}`
        : ''
    return `${index + 1}. ${details.join(' · ')}${flag}`
  })
  const pending = expenseDrafts.some((expenseDraft, index) => warnings[index] || expenseDraft.missingFields.length)

  return {
    text: [
      `📋 <b>${expenseDrafts.length} gastos</b> · total ${total.join(' + ') || '—'}`,
      ...lines,
      ...(pending ? ['', '<i>Guardar todos deja los repetidos e incompletos en /borrador.</i>'] : []),
    ].join('\n'),
    buttons: [
      [button('✅ Guardar todos', BotAction.SAVE_ALL, batchId)],
      [
        button('📝 Revisar uno por uno', BotAction.REVIEW_ALL, batchId),
        button('📝 Borrador', BotAction.LATER_ALL, batchId),
      ],
    ],
  }
}

export function formatRecent(expenseDrafts: ExpenseDraftDbDto[]): string {
  if (!expenseDrafts.length) return TEXTS.noRecent

  return [
    '<b>Últimos gastos</b>',
    ...expenseDrafts.map(
      (expenseDraft) =>
        `• ${formatDate(expenseDraft.spentAt)} ${escapeHtml(expenseDraft.description ?? '—')} — ${formatAmount(expenseDraft.amount, expenseDraft.currency)} (${DESTINATION_LABELS[expenseDraft.destination as ExpenseDestination] ?? '—'})`,
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
    ...new Set(totals.filter((row) => !DEBT_DESTINATIONS.includes(row.destination)).map((row) => row.personId)),
  ]

  return [
    `<b>Resumen de ${monthLabel}</b>`,
    ...destinations.map((destination) => {
      const label = DEBT_DESTINATIONS.includes(destination)
        ? `${DESTINATION_LABELS[destination]} (saldo pendiente)`
        : DESTINATION_LABELS[destination]
      return `• ${label}: ${sum(totals.filter((row) => row.destination === destination))}`
    }),
    '',
    '<b>Por persona</b>',
    ...people.map(
      (personId) =>
        `• ${nameOf(catalog, personId)}: ${sum(totals.filter((row) => row.personId === personId && !DEBT_DESTINATIONS.includes(row.destination)))}`,
    ),
  ].join('\n')
}

// /borrador: one message per expense pending review, with Retomar / Descartar
export function buildDraftReplies(items: ExpenseDraftDbDto[], total: number, catalog: ExtractionCatalog): BotReply[] {
  if (!items.length) return [{ text: TEXTS.emptyDrafts }]

  return [
    { text: TEXTS.draftsHeader(items.length, total) },
    ...items.map((expenseDraft) => ({
      text:
        expenseDraft.status === ExpenseDraftStatus.FAILED
          ? `⚠️ ${TEXTS.failedExtraction}\n<i>${escapeHtml(expenseDraft.rawText ?? '')}</i>`
          : formatSummary(expenseDraft, catalog),
      buttons: [
        [
          button('↩️ Retomar', BotAction.RESUME, expenseDraft.id),
          button('❌ Descartar', BotAction.DISCARD, expenseDraft.id),
        ],
      ],
    })),
  ]
}

// Keeps the typed name short enough for callback_data (64 bytes in total)
// /uso: one line per model; the bot stops using a model at its usable limit (90 % of the free quota)
export function formatAiUsage(usage: AiModelUsage[], ocr?: { attempts: number; resolved: number }): string {
  const lines = usage.map(({ provider, model, used, usableLimit }) => {
    const icon = used >= usableLimit ? '🔴' : used >= usableLimit * 0.8 ? '🟡' : '🟢'
    return `${icon} <b>${escapeHtml(provider)}</b> ${escapeHtml(model)}: ${used} de ${usableLimit}`
  })
  // P21: bank screenshots read by the local OCR, without spending AI
  const ocrLine = ocr?.attempts ? [`🔎 <b>OCR local</b>: ${ocr.resolved} de ${ocr.attempts} capturas sin AI`] : []
  return [
    '🤖 <b>Uso de la AI hoy</b>',
    ...lines,
    ...ocrLine,
    '',
    '<i>Al llegar al límite uso el siguiente modelo.</i>',
  ].join('\n')
}

export function toNewPaymentMethodName(text: string): string {
  let name = text.replace(/[:\n]/g, ' ').replace(/\s+/g, ' ').trim()
  while (Buffer.byteLength(name) > MAX_NEW_PAYMENT_METHOD_NAME_BYTES) name = name.slice(0, -1)
  return name.trim()
}

// "No conozco bbva. ¿Lo agrego?" with one button per payment method type
export function buildNewPaymentMethodReply(draftId: string, name: string): BotReply {
  const types = [
    PaymentMethodType.DEBIT_CARD,
    PaymentMethodType.WALLET,
    PaymentMethodType.CREDIT_CARD,
    PaymentMethodType.CASH,
  ]
  const create = (type: PaymentMethodType) => ({
    label: PAYMENT_TYPE_LABELS[type],
    data: encodeBotAction({ name: BotAction.NEW_PAYMENT_METHOD, draftId, field: type, value: name }),
  })

  return {
    text: `No conozco <b>${escapeHtml(name)}</b>. ¿Lo agrego como medio de pago? Elige el tipo:`,
    buttons: [
      ...toRows(types.map(create)),
      [{ label: 'No', data: encodeBotAction({ name: BotAction.NEW_PAYMENT_METHOD, draftId }) }],
    ],
  }
}
