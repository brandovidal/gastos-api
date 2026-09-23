import { CatalogKind } from '@/commons/constants/expense-extraction.constant'

import {
  buildExtractionCatalog,
  findCatalogEntry,
  findCatalogEntryById,
  findDefaultPerson,
  matchCatalogEntry,
} from './expense-extraction.catalog'
import { mockCatalogSource } from './mocks/expense-extraction.mock'

describe('expense extraction catalog', () => {
  const catalog = buildExtractionCatalog(mockCatalogSource)

  it('should render short refs, aliases and card links without database ids', () => {
    expect(catalog.promptText).toContain('p1 Brando [default] (aliases: yo, yuji)')
    expect(catalog.promptText).toContain('p2 Danery (aliases: dany, mi esposa)')
    expect(catalog.promptText).toContain('pm2 OhPay [credit_card -> cc1] (aliases: la oh)')
    expect(catalog.promptText).toContain('cc1 Oh Visa (aliases: oh)')
    expect(catalog.promptText).toContain('cat1 Comida')
    expect(catalog.promptText).not.toContain('person-danery')
  })

  it('should find entries by ref and kind only', () => {
    expect(findCatalogEntry(catalog, CatalogKind.PERSON, 'P2')?.id).toBe('person-danery')
    expect(findCatalogEntry(catalog, CatalogKind.PERSON, 'pm1')).toBeNull()
    expect(findCatalogEntry(catalog, CatalogKind.PERSON, 'p9')).toBeNull()
    expect(findCatalogEntry(catalog, CatalogKind.PERSON, null)).toBeNull()
  })

  it('should match names and aliases as whole words, ignoring case and accents', () => {
    expect(matchCatalogEntry(catalog, CatalogKind.PERSON, 'lo pagó Mi Esposa')?.id).toBe('person-danery')
    expect(matchCatalogEntry(catalog, CatalogKind.PAYMENT_METHOD, 'con la oh')?.id).toBe('method-ohpay')
    expect(matchCatalogEntry(catalog, CatalogKind.PERSON, 'yogurt')).toBeNull()
  })

  it('should find the default person and entries by database id', () => {
    expect(findDefaultPerson(catalog)?.id).toBe('person-brando')
    expect(findCatalogEntryById(catalog, 'card-oh')?.name).toBe('Oh Visa')
    expect(findCatalogEntryById(catalog, null)).toBeNull()
  })
})
