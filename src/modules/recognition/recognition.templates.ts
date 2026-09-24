import { normalizeText } from '@/modules/expense-extraction/expense-extraction.catalog'

// Local templates over the OCR text of bank screenshots (P21, D47, D63). Each one returns null when something does not
// add up, and the screenshot goes to the AI.

export enum RecognizedScreen {
  IO_PURCHASE_DETAIL = 'io_purchase_detail', // "Detalle de categoría": the purchases of one category, with cuotas
  IO_CATEGORY_SUMMARY = 'io_category_summary', // "Movimientos" by category: total of the month, no expenses
  BANK_MOVEMENT = 'bank_movement', // Interbank "Detalle de movimiento": Plin or transfer
}

export interface RecognizedExpense {
  merchant: string
  amount: number // of this installment when installments > 1 (total / n, D45)
  total: number
  currency: 'PEN' | 'USD'
  spentAt: string // YYYY-MM-DD, the date of the operation
  installments: number | null
  bankCategory: string | null
  pending: boolean // "EN PROCESO"
  card: 'primary' | null // the card of the app (IO) when the screenshot does not name it
  transfer: string | null // "Plin-Danery" → "Plin"
  counterpart: string | null // "Plin-Danery" → "Danery"
}

export interface CategoryTotal {
  name: string
  amount: number
  count: number
}

export type RecognitionResult =
  | { screen: RecognizedScreen.IO_PURCHASE_DETAIL | RecognizedScreen.BANK_MOVEMENT; expenses: RecognizedExpense[] }
  | { screen: RecognizedScreen.IO_CATEGORY_SUMMARY; month: number; total: number; categories: CategoryTotal[] }

const MONTHS: Record<string, number> = {
  ene: 1,
  enero: 1,
  feb: 2,
  febrero: 2,
  mar: 3,
  marzo: 3,
  abr: 4,
  abril: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  junio: 6,
  jul: 7,
  julio: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  sep: 9,
  sept: 9,
  setiembre: 9,
  septiembre: 9,
  oct: 10,
  octubre: 10,
  nov: 11,
  noviembre: 11,
  dic: 12,
  diciembre: 12,
}

// "-S/1,649.00", "s/-100.002" (a badge read as an extra digit), "S/ 30.90", "-$20.00"
const MONEY = /(-)?\s*(s\/|\$)\s*(-)?\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})/i
const DATE = /\b(\d{1,2})\s+([a-z]{3,10})\.?\s+(\d{4})\b/
const COUNT = /^(\d+)\s*consumos?$/
const INSTALLMENTS = /(\d+)\s*cuotas?/

interface Money {
  amount: number
  currency: 'PEN' | 'USD'
  negative: boolean
}

export function parseMoney(line: string): Money | null {
  const match = line.match(MONEY)
  if (!match) return null
  return {
    amount: Number(`${match[4].replace(/,/g, '')}.${match[5]}`),
    currency: match[2] === '$' ? 'USD' : 'PEN',
    negative: !!(match[1] || match[3]),
  }
}

export function parseDate(line: string): string | null {
  const match = normalizeText(line).match(DATE)
  const month = match && MONTHS[match[2]]
  if (!match || !month) return null
  return `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

// Screens told apart by their fixed labels; anything else (Yape, IO list of movements) goes to the AI (D63)
export function detectScreen(text: string): RecognizedScreen | null {
  const normalized = normalizeText(text)
  if (normalized.includes('detalle de movimiento')) return RecognizedScreen.BANK_MOVEMENT
  if (normalized.includes('detalle de categoria')) return RecognizedScreen.IO_PURCHASE_DETAIL
  if (normalized.includes('movimientos') && /\d+\s*consumos?/.test(normalized) && !normalized.includes('virtual')) {
    return RecognizedScreen.IO_CATEGORY_SUMMARY
  }
  return null
}

export function recognizeText(text: string): RecognitionResult | null {
  switch (detectScreen(text)) {
    case RecognizedScreen.IO_PURCHASE_DETAIL:
      return parsePurchaseDetail(text)
    case RecognizedScreen.IO_CATEGORY_SUMMARY:
      return parseCategorySummary(text)
    case RecognizedScreen.BANK_MOVEMENT:
      return parseBankMovement(text)
    default:
      return null
  }
}

// A merchant line of the card app: mostly capital letters ("MP*MERCADOLI...", "PEDIDOSYA FO...")
const isMerchant = (line: string) =>
  /[A-Z]{3}/.test(line) &&
  !/virtual|en proceso|consumo|detalle|categor/i.test(line) &&
  !MONEY.test(line) &&
  !parseDate(line)

// IO "Detalle de categoría": [date] merchant · "Virtual / N cuotas" · -S/amount, as many as "N consumos" says
function parsePurchaseDetail(text: string): RecognitionResult | null {
  const all = lines(text)
  const countIndex = all.findIndex((line) => COUNT.test(normalizeText(line)))
  if (countIndex < 0) return null
  const expected = Number(normalizeText(all[countIndex]).match(COUNT)![1])
  const bankCategory =
    all
      .slice(0, countIndex)
      .reverse()
      .find((line) => /^[A-Z][A-Z\s\-&]{2,}$/.test(line)) ?? null

  const expenses: RecognizedExpense[] = []
  let date: string | null = null
  let merchant: string | null = null
  let installments: number | null = null
  let pending = false

  for (const line of all.slice(countIndex + 1)) {
    const lineDate = parseDate(line)
    if (lineDate) {
      date = lineDate
      continue
    }
    if (/en proceso/i.test(line)) pending = true
    const cuotas = normalizeText(line).match(INSTALLMENTS)
    if (/virtual/i.test(line)) installments = cuotas ? Number(cuotas[1]) : null

    const money = parseMoney(line)
    // Only the charges of each purchase are negative; the totals of the header are not
    if (money?.negative) {
      if (!merchant || !date) return null
      if (money.amount > 0) {
        const perInstallment =
          installments && installments > 1 ? Math.round((money.amount / installments) * 100) / 100 : money.amount
        expenses.push({
          merchant: merchant.replace(/\.{2,}$|…$/, '').trim(),
          amount: perInstallment,
          total: money.amount,
          currency: money.currency,
          spentAt: date,
          installments: installments && installments > 1 ? installments : null,
          bankCategory,
          pending,
          card: 'primary',
          transfer: null,
          counterpart: null,
        })
      }
      merchant = null
      installments = null
      pending = false
      continue
    }
    if (isMerchant(line)) merchant = line
  }

  // Every purchase the app counts must have been read, or the AI does it
  const charges = all.slice(countIndex + 1).filter((line) => parseMoney(line)?.negative).length
  return charges === expected && expenses.length ? { screen: RecognizedScreen.IO_PURCHASE_DETAIL, expenses } : null
}

// IO "Movimientos" by category: total of the month and each category with its amount and count
function parseCategorySummary(text: string): RecognitionResult | null {
  const all = lines(text)
  const header = all.findIndex((line) => /consumo total en/i.test(line))
  if (header < 0) return null
  const month =
    MONTHS[
      normalizeText(all[header])
        .replace(/.*consumo total en\s+/, '')
        .split(/\s+/)[0]
    ]
  const total = all
    .slice(header + 1)
    .map(parseMoney)
    .find(Boolean)
  if (!month || !total) return null

  const categories: CategoryTotal[] = []
  all.forEach((line, index) => {
    if (!/^[A-Z][A-Z\s\-&]{2,}$/.test(line) || /CONSUMO TOTAL/.test(line)) return
    const window = all.slice(index + 1, index + 5)
    const money = window.map(parseMoney).find(Boolean)
    const count = window.map((item) => normalizeText(item).match(COUNT)).find(Boolean)
    if (money && count) categories.push({ name: line, amount: money.amount, count: Number(count[1]) })
  })

  return categories.length
    ? { screen: RecognizedScreen.IO_CATEGORY_SUMMARY, month, total: total.amount, categories }
    : null
}

// Interbank "Detalle de movimiento": amount, the date of the operation (not the process date) and "Plin-Danery"
function parseBankMovement(text: string): RecognitionResult | null {
  const all = lines(text)
  const money = all.map(parseMoney).find(Boolean)
  const spentAt = all.map(parseDate).find(Boolean)
  const typeIndex = all.findIndex((line) => /tipo de operaci/i.test(line))
  const operation = typeIndex >= 0 ? all[typeIndex + 1] : null
  if (!money || !money.negative || !spentAt || !operation) return null

  const [transfer, counterpart] = operation.split(/\s*-\s*/)
  return {
    screen: RecognizedScreen.BANK_MOVEMENT,
    expenses: [
      {
        merchant: operation,
        amount: money.amount,
        total: money.amount,
        currency: money.currency,
        spentAt,
        installments: null,
        bankCategory: null,
        pending: false,
        card: null,
        transfer: transfer || null,
        counterpart: counterpart || null,
      },
    ],
  }
}
