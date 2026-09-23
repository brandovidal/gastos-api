import { DebtDirection } from '@/commons/constants/debt.constant'
import { CatalogKind } from '@/commons/constants/expense-extraction.constant'
import { matchCatalogEntry, normalizeText } from '@/modules/expense-extraction/expense-extraction.catalog'
import { ExtractionCatalog } from '@/modules/expense-extraction/dto/expense-extraction.types'

export interface DebtPaymentIntent {
  personId: string
  direction: DebtDirection
  amount: number
}

const AMOUNT = String.raw`(?:s\/\.?\s*)?(\d+(?:[.,]\d{1,2})?)(?:\s*soles)?`
const PAID_VERBS = '(?:pago|yapeo|plineo|devolvio|abono|deposito|transfirio)'
const MY_VERBS = '(?:pague|devolvi|abone|yapee|plinee|deposite|transferi)'

// Only whole short sentences: anything longer ("le pagué 50 a dany por el almuerzo") goes to the AI as an expense
const PATTERNS: { regex: RegExp; direction: DebtDirection; person: number; amount: number }[] = [
  // "dany me pagó 150", "dany me yapeó s/ 150"
  {
    regex: new RegExp(`^(.+?) me ${PAID_VERBS} ${AMOUNT}$`),
    direction: DebtDirection.OWED_TO_ME,
    person: 1,
    amount: 2,
  },
  // "abono 150 dany", "abono de 150 de dany", "me pagaron 150 dany"
  {
    regex: new RegExp(`^(?:abono|me pagaron|me yapearon)(?: de)? ${AMOUNT}(?: de)? (.+)$`),
    direction: DebtDirection.OWED_TO_ME,
    person: 2,
    amount: 1,
  },
  // "le pagué 50 a dany", "devolví 50 a dany"
  { regex: new RegExp(`^(?:le )?${MY_VERBS} ${AMOUNT} a (.+)$`), direction: DebtDirection.I_OWE, person: 2, amount: 1 },
]

// "dany me pagó 150" → a payment of Danery towards what she owes (P17 block 2). Null when the sentence does not
// look like a payment or names nobody of the catalog.
export function parseDebtPayment(text: string, catalog: ExtractionCatalog): DebtPaymentIntent | null {
  const normalized = normalizeText(text).replace(/[!.?]+$/, '')

  for (const { regex, direction, person, amount } of PATTERNS) {
    const match = normalized.match(regex)
    if (!match) continue

    const value = Number(match[amount].replace(',', '.'))
    const name = match[person].trim()
    const entry = matchCatalogEntry(catalog, CatalogKind.PERSON, name)
    // The name must be the whole rest of the sentence: "a dany por el almuerzo" is an expense, not a payment
    const isExactName = entry && [entry.name, ...entry.aliases].map(normalizeText).includes(name)
    if (!entry || !isExactName || !(value > 0)) return null

    return { personId: entry.id, direction, amount: value }
  }

  return null
}
