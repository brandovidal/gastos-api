import { CatalogKind } from '@/commons/constants/expense-extraction.constant'
import { ExpenseShare, SharedExpense } from '@/db/models/expense-draft/expenseDraftDB.dto'
import { findCatalogEntryByName } from '@/modules/expense-extraction/expense-extraction.catalog'
import { ExtractionCatalog } from '@/modules/expense-extraction/dto/expense-extraction.types'

// Gastos compartidos (D73, D74), read without the AI. The user paid it all and each person owes a part:
//   "cena 120 con dany, mitad" · "pizza 90 a medias con dany" · "taxi 60 entre 3 con dany y juan"
//   "netflix 64 compartido con danary y yo" · "netflix 64 con dany la tercera parte" · "luz 200 con dany 30% y brenda 20%"
//   "netflix 64, dany paga 20"
// The split phrase is removed, so the AI only reads the expense ("cena 120"). Names must be catalog people (a
// transcription close to one counts: "Danary"); anything else is left to the AI, which can answer `shares` too.

const NUMBERS: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 }
const NUMBER = String.raw`\d+(?:[.,]\d{1,2})?`

// Words that say the expense is shared; without one, "con dany" is only who the user was with
const SIGNAL = new RegExp(
  String.raw`\b(compartid[oa]s?|compartir|a medias|mitad|tercio|tercera parte|cuarta parte|entre (?:\d+|dos|tres|cuatro|cinco|seis)|${NUMBER} ?(?:%|por ?ciento)|y yo)\b|%`,
)
// A split said for everyone, anywhere in the text
const GLOBAL_SPLIT = /\b(a medias|mitad y mitad|(?:a )?(?:la )?mitad|entre (\d+|dos|tres|cuatro|cinco|seis))\b/
// "dany paga 20", "brenda pone 15.50"
const PAYS = new RegExp(String.raw`(?:^|,|\by\b)\s*([a-zñ]+) (?:paga|pone|me da) (${NUMBER})(?: soles)?`, 'g')

// Lowercase without accents, one character per character, so indexes match the original text
const fold = (text: string) =>
  [...text].map((char) => char.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')[0] ?? char).join('')

const toNumber = (value: string) => Number(value.replace(',', '.'))

// "30%", "20 por ciento", "la mitad", "un tercio", "la tercera parte", "la cuarta parte", "20" / "20 soles"
export function parseShare(text: string): Pick<ExpenseShare, 'ratio' | 'amount'> | null {
  const percent = new RegExp(String.raw`^(${NUMBER}) ?(?:%|por ?ciento)$`).exec(text)
  if (percent) return { ratio: toNumber(percent[1]) / 100 }
  if (/^(?:la )?mitad$/.test(text)) return { ratio: 1 / 2 }
  if (/^(?:un tercio|(?:la )?tercera parte)$/.test(text)) return { ratio: 1 / 3 }
  if (/^(?:la )?cuarta parte$/.test(text)) return { ratio: 1 / 4 }
  const amount = new RegExp(String.raw`^(${NUMBER})(?: soles)?$`).exec(text)
  if (amount) return { amount: toNumber(amount[1]) }
  return null
}

export interface SharedExpenseMatch {
  text: string // the message without the split phrase, for the AI
  sharedWith: SharedExpense
}

export function parseSharedExpense(text: string, catalog: ExtractionCatalog): SharedExpenseMatch | null {
  const folded = fold(text)
  const person = (name: string) => findCatalogEntryByName(catalog, CatalogKind.PERSON, name)

  // "dany paga 20": fixed amounts, no "con" needed
  const pays = [...folded.matchAll(PAYS)]
  if (pays.length) {
    const shares = pays.map((match) => ({ id: person(match[1])?.id, amount: toNumber(match[2]) }))
    if (shares.every((share) => share.id)) {
      const rest = cleanRest(text.slice(0, pays[0].index))
      return rest
        ? { text: rest, sharedWith: { shares: shares.map(({ id, amount }) => ({ personId: id as string, amount })) } }
        : null
    }
  }

  if (!SIGNAL.test(folded)) return null

  // The people follow the last "con": "cena 120 con yape con dany, mitad" → "dany, mitad"
  const conIndex = folded.lastIndexOf(' con ')
  if (conIndex < 0) return null
  const segments = folded
    .slice(conIndex + 5)
    .replace(/[.!]+\s*$/, '')
    .split(/\s*(?:,|\by\b)\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  const people: { id: string; share: Pick<ExpenseShare, 'ratio' | 'amount'> | null }[] = []
  for (const segment of segments) {
    // "con dany y yo": the user is counted anyway (always one of the parts)
    if (segment === 'yo') continue
    // "dany 30%", "dany la mitad", "dany", or a split word after the names ("mitad", "a medias")
    const [, name, shareText] = /^([a-zñ]+)(?: (.+))?$/.exec(segment) ?? []
    const entry = name ? person(name) : null
    if (entry) {
      // "danery a medias": the split for everyone, not her own share
      const isGlobal = shareText != null && new RegExp(`^${GLOBAL_SPLIT.source}$`).test(shareText)
      const share = shareText && !isGlobal ? parseShare(shareText) : null
      if (shareText && !isGlobal && !share) return null
      people.push({ id: entry.id, share })
      continue
    }
    if (parseShare(segment) && people.length) {
      people[people.length - 1].share = parseShare(segment)
      continue
    }
    if (GLOBAL_SPLIT.test(segment)) continue
    return null
  }
  if (!people.length) return null

  // Without their own share, everyone (the user included) pays the same: "entre 3" says how many are paying
  const global = GLOBAL_SPLIT.exec(folded)
  const count = global?.[2] ? (NUMBERS[global[2]] ?? Number(global[2])) : 0
  const parts = Math.max(count, people.length + 1)
  const shares: ExpenseShare[] = people.map(({ id, share }) => ({ personId: id, ...(share ?? { ratio: 1 / parts }) }))

  const start = Math.min(conIndex, global && global.index < conIndex ? global.index : conIndex)
  const rest = cleanRest(text.slice(0, start))
  return rest ? { text: rest, sharedWith: { shares: dedupe(shares) } } : null
}

// "Quiero establecer un pago compartido de Netflix de 64 soles," → "Quiero establecer un pago de Netflix de 64 soles"
function cleanRest(text: string): string {
  return text
    .replace(/\s*\bcompartid[oa]s?\b/gi, '')
    .replace(/[\s,]+$/, '')
    .trim()
}

const dedupe = (shares: ExpenseShare[]) =>
  shares.filter((share, index) => shares.findIndex((other) => other.personId === share.personId) === index)

const round2 = (value: number) => Math.round(value * 100) / 100

// What each person owes of `amount` (ratio of the total or a fixed amount, rounded to cents), what they owe
// together (othersShare) and what is left for the user. Never more than the total.
export function sharesOf(amount: number, { shares }: SharedExpense) {
  const parts = shares.map((share) => ({
    personId: share.personId,
    amount: round2(share.amount ?? amount * (share.ratio ?? 0)),
  }))
  const othersShare = round2(
    Math.min(
      amount,
      parts.reduce((sum, part) => sum + part.amount, 0),
    ),
  )
  return { parts, othersShare, own: round2(amount - othersShare) }
}

// A message that only says the split ("compartido con dany a medias", "dany paga 20") while an expense is open:
// it shares that expense instead of being a new one
export function parseShareCorrection(text: string, catalog: ExtractionCatalog): SharedExpense | null {
  const placeholder = 'gasto'
  const match =
    parseSharedExpense(`${placeholder} ${text}`, catalog) ?? parseSharedExpense(`${placeholder}, ${text}`, catalog)
  return match && match.text === placeholder ? match.sharedWith : null
}
