import { CatalogKind } from '@/commons/constants/expense-extraction.constant'
import { SavedExpenseFilters } from '@/db/models/expense-draft/expenseDraftDB.dto'
import {
  findCatalogEntryByName,
  matchCatalogEntry,
  normalizeText,
} from '@/modules/expense-extraction/expense-extraction.catalog'
import { ExtractionCatalog } from '@/modules/expense-extraction/dto/expense-extraction.types'

// /editar looks this far back
const SEARCH_DAYS = 365

const KINDS: [CatalogKind, keyof Pick<SavedExpenseFilters, 'personId' | 'paymentMethodId' | 'categoryId'>][] = [
  [CatalogKind.PERSON, 'personId'],
  [CatalogKind.PAYMENT_METHOD, 'paymentMethodId'],
  [CatalogKind.CATEGORY, 'categoryId'],
]

// "/editar dany netflix 64 22/09" → amount 64, day 22/09, person Danery, text "netflix" (D76). Each word is tried as an
// amount, a date ("22/09", "22/09/2026", "hoy", "ayer") or a catalog name; the rest is searched in the concept.
export function parseSavedSearch(args: string, catalog: ExtractionCatalog, today: string): SavedExpenseFilters {
  const todayDate = new Date(`${today}T00:00:00.000Z`)
  const filters: SavedExpenseFilters = { since: new Date(todayDate.getTime() - SEARCH_DAYS * 86_400_000) }
  const rest: string[] = []
  let text = ` ${normalizeText(args)} `

  // Whole catalog names first, so "la oh" or "costos fijos" are one name, not two words
  for (const [kind, key] of KINDS) {
    const entry = matchCatalogEntry(catalog, kind, text)
    if (!entry) continue
    const term = [entry.name, ...entry.aliases]
      .map(normalizeText)
      .filter((candidate) => candidate && text.includes(` ${candidate} `))
      .sort((a, b) => b.length - a.length)[0]
    if (!term) continue
    filters[key] = entry.id
    text = text.replace(` ${term} `, ' ')
  }

  for (const word of text.trim().split(' ').filter(Boolean)) {
    const amount = /^(?:s\/\.?)?(\d+(?:[.,]\d{1,2})?)$/.exec(word)
    const date = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(word)
    if (amount && filters.amount == null && !date) {
      filters.amount = Number(amount[1].replace(',', '.'))
    } else if (date && !filters.day) {
      const year = date[3] ? Number(date[3]) : todayDate.getUTCFullYear()
      filters.day = new Date(Date.UTC(year, Number(date[2]) - 1, Number(date[1])))
    } else if ((word === 'hoy' || word === 'ayer') && !filters.day) {
      filters.day = new Date(todayDate.getTime() - (word === 'ayer' ? 86_400_000 : 0))
    } else {
      const match = KINDS.find(([kind, key]) => !filters[key] && findCatalogEntryByName(catalog, kind, word))
      if (match) filters[match[1]] = findCatalogEntryByName(catalog, match[0], word)?.id
      else rest.push(word)
    }
  }

  if (rest.length) filters.text = rest.join(' ')
  return filters
}
