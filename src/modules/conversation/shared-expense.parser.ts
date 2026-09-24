import { CatalogKind } from '@/commons/constants/expense-extraction.constant'
import { SharedExpense } from '@/db/models/expense-draft/expenseDraftDB.dto'
import { normalizeText } from '@/modules/expense-extraction/expense-extraction.catalog'
import { ExtractionCatalog } from '@/modules/expense-extraction/dto/expense-extraction.types'

// Gastos compartidos (P17), read without the AI: "cena 120 con dany, mitad", "pizza 90 a medias con dany",
// "taxi 60 entre 3 con dany y juan". The split phrase is removed so the AI only reads the expense ("cena 120"),
// and the draft keeps who shares it. Every name must be a whole person name or alias; otherwise it is left to the AI.

const NUMBERS: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 }
const SPLIT = String.raw`(a medias|mitad y mitad|(?:a )?(?:la )?mitad|entre (\d+|dos|tres|cuatro|cinco|seis))`
const PATTERNS = [
  // "... con dany, mitad" / "... con dany y juan entre 3"; the last "con" ("cena 120 con yape con dany, mitad")
  {
    regex: new RegExp(String.raw`\s*,?\s*\bcon ((?:(?!\bcon\b).)+?)\s*,?\s*${SPLIT}\s*[.!]?$`),
    people: 1,
    split: 2,
    count: 3,
  },
  // "... a medias con dany" / "... entre 3 con dany y juan"
  { regex: new RegExp(String.raw`\s*,?\s*\b${SPLIT} con (.+?)\s*[.!]?$`), people: 3, split: 1, count: 2 },
]

// Lowercase without accents, one character per character, so indexes match the original text
const fold = (text: string) =>
  [...text].map((char) => char.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')[0] ?? char).join('')

export interface SharedExpenseMatch {
  text: string // the message without the split phrase, for the AI
  sharedWith: SharedExpense
}

export function parseSharedExpense(text: string, catalog: ExtractionCatalog): SharedExpenseMatch | null {
  const folded = fold(text)
  const people = catalog.entries.filter((entry) => entry.kind === CatalogKind.PERSON)

  for (const pattern of PATTERNS) {
    const match = pattern.regex.exec(folded)
    if (!match) continue

    const names = match[pattern.people].split(/\s*(?:,|\by\b)\s*/).filter(Boolean)
    const personIds = names.map(
      (name) =>
        people.find((person) => [person.name, ...person.aliases].map(normalizeText).includes(normalizeText(name)))?.id,
    )
    if (!personIds.length || personIds.some((id) => !id)) return null

    const count = match[pattern.count]
    const said = count ? (NUMBERS[count] ?? Number(count)) : 0
    const parts = Math.max(said, personIds.length + 1)
    const rest = text.slice(0, match.index).trim()
    if (!rest) return null

    return { text: rest, sharedWith: { personIds: [...new Set(personIds as string[])], parts } }
  }
  return null
}

// Each one's part of a shared amount, rounded to cents; the user keeps what is left (so the parts add up)
export function sharesOf(amount: number, { personIds, parts }: SharedExpense) {
  const share = Math.round((amount / parts) * 100) / 100
  return { share, own: Math.round((amount - share * personIds.length) * 100) / 100 }
}
