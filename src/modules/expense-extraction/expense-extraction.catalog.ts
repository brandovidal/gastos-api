import { Category } from '@/generated/prisma/client'
import { CATALOG_REF_PREFIX, CatalogKind } from '@/commons/constants/expense-extraction.constant'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { PersonDbDto } from '@/db/models/person/personDB.dto'
import { PaymentMethodDbDto } from '@/db/models/payment-method/paymentMethodDB.dto'

import { CatalogEntry, ExtractionCatalog } from './dto/expense-extraction.types'

interface CatalogSource {
  people: PersonDbDto[]
  paymentMethods: PaymentMethodDbDto[]
  categories: Category[]
}

const ref = (kind: CatalogKind, index: number) => `${CATALOG_REF_PREFIX[kind]}${index + 1}`

const aliasText = (aliases: string[]) => (aliases.length ? ` (aliases: ${aliases.join(', ')})` : '')

// Builds the catalog the AI chooses from. Short refs keep the prompt small and make invented ids detectable.
export function buildExtractionCatalog({ people, paymentMethods, categories }: CatalogSource): ExtractionCatalog {
  const entries: CatalogEntry[] = [
    ...people.map((person, index) => ({
      ref: ref(CatalogKind.PERSON, index),
      kind: CatalogKind.PERSON,
      id: person.id,
      name: person.name,
      aliases: person.aliases,
      isDefault: person.isDefault,
    })),
    ...paymentMethods.map((method, index) => ({
      ref: ref(CatalogKind.PAYMENT_METHOD, index),
      kind: CatalogKind.PAYMENT_METHOD,
      id: method.id,
      name: method.name,
      // The card code (CMR, OH…) is matched like an alias
      aliases: method.code ? [...method.aliases, method.code.toLowerCase()] : method.aliases,
      paymentType: method.type as PaymentMethodType,
      showInBot: method.showInBot,
      billingCloseDay: method.billingCloseDay,
      isPrimary: method.isPrimary,
    })),
    ...categories.map((category, index) => ({
      ref: ref(CatalogKind.CATEGORY, index),
      kind: CatalogKind.CATEGORY,
      id: category.id,
      name: category.name,
      aliases: [],
    })),
  ]

  const lines = (kind: CatalogKind, render: (entry: CatalogEntry) => string) =>
    entries
      .filter((entry) => entry.kind === kind)
      .map(render)
      .join('\n') || '(none)'

  const promptText = [
    'people:',
    lines(
      CatalogKind.PERSON,
      (entry) => `${entry.ref} ${entry.name}${entry.isDefault ? ' [default]' : ''}${aliasText(entry.aliases)}`,
    ),
    'paymentMethods:',
    lines(
      CatalogKind.PAYMENT_METHOD,
      (entry) =>
        `${entry.ref} ${entry.name} [${entry.paymentType}]${entry.isPrimary ? ' [primary]' : ''}${aliasText(entry.aliases)}`,
    ),
    'categories:',
    lines(CatalogKind.CATEGORY, (entry) => `${entry.ref} ${entry.name}`),
  ].join('\n')

  return { entries, promptText }
}

export function findDefaultPerson(catalog: ExtractionCatalog): CatalogEntry | null {
  return catalog.entries.find((entry) => entry.kind === CatalogKind.PERSON && entry.isDefault) ?? null
}

// The card of bank screenshots that do not show which one (D47: IO)
export function findPrimaryCard(catalog: ExtractionCatalog): CatalogEntry | null {
  return (
    catalog.entries.find(
      (entry) =>
        entry.kind === CatalogKind.PAYMENT_METHOD &&
        entry.isPrimary &&
        entry.paymentType === PaymentMethodType.CREDIT_CARD,
    ) ?? null
  )
}

export function findCatalogEntryById(catalog: ExtractionCatalog, id: string | null): CatalogEntry | null {
  return id ? (catalog.entries.find((entry) => entry.id === id) ?? null) : null
}

export function findCatalogEntry(
  catalog: ExtractionCatalog,
  kind: CatalogKind,
  entryRef: string | null,
): CatalogEntry | null {
  if (!entryRef) return null
  return catalog.entries.find((entry) => entry.kind === kind && entry.ref === entryRef.trim().toLowerCase()) ?? null
}

// Payment methods offered as quick replies in the bot
export function botPaymentMethods(catalog: ExtractionCatalog): CatalogEntry[] {
  return catalog.entries.filter((entry) => entry.kind === CatalogKind.PAYMENT_METHOD && entry.showInBot)
}

export const normalizeText = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Finds the catalog entry whose name or alias appears as whole words in the text (longest match wins)
export function matchCatalogEntry(catalog: ExtractionCatalog, kind: CatalogKind, text: string): CatalogEntry | null {
  const normalized = ` ${normalizeText(text)} `
  let best: { entry: CatalogEntry; length: number } | null = null

  for (const entry of catalog.entries.filter((candidate) => candidate.kind === kind)) {
    for (const term of [entry.name, ...entry.aliases].map(normalizeText).filter(Boolean)) {
      const found = new RegExp(`(^|[^a-z0-9])${escapeRegex(term)}($|[^a-z0-9])`).test(normalized)

      if (found && (!best || term.length > best.length)) {
        best = { entry, length: term.length }
      }
    }
  }

  return best?.entry ?? null
}

// Edits (insert, delete, replace) that turn a into b
function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous[b.length]
}

const MIN_FUZZY_LENGTH = 5
const MAX_FUZZY_DISTANCE = 2

// A whole name of the catalog, or one written or transcribed a little differently ("Danary" → Danery, D74).
// Only names of 5+ letters are compared loosely, and only when a single entry is that close.
export function findCatalogEntryByName(
  catalog: ExtractionCatalog,
  kind: CatalogKind,
  name: string,
): CatalogEntry | null {
  const target = normalizeText(name)
  const entries = catalog.entries.filter((entry) => entry.kind === kind)
  const terms = (entry: CatalogEntry) => [entry.name, ...entry.aliases].map(normalizeText).filter(Boolean)

  const exact = entries.find((entry) => terms(entry).includes(target))
  if (exact || target.length < MIN_FUZZY_LENGTH) return exact ?? null

  const close = entries.filter((entry) =>
    terms(entry).some((term) => term.length >= MIN_FUZZY_LENGTH && levenshtein(term, target) <= MAX_FUZZY_DISTANCE),
  )
  return close.length === 1 ? close[0] : null
}
