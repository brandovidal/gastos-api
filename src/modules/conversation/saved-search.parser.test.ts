import { parseSavedSearch } from './saved-search.parser'
import { mockCatalog } from './mocks/conversation.mock'

const TODAY = '2026-09-23'

describe('parseSavedSearch (D76)', () => {
  it('should read amount, catalog names (also of two words) and leave the rest for the concept', () => {
    expect(parseSavedSearch('netflix 64 la oh dany', mockCatalog, TODAY)).toEqual({
      text: 'netflix',
      amount: 64,
      paymentMethodId: 'method-ohpay',
      personId: 'person-danery',
      since: new Date('2025-09-23T00:00:00.000Z'),
    })
  })

  it.each([
    ['22/09', '2026-09-22'],
    ['22/09/2025', '2025-09-22'],
    ['hoy', '2026-09-23'],
    ['ayer', '2026-09-22'],
  ])('should read the date "%s"', (word, day) => {
    expect(parseSavedSearch(`yape ${word}`, mockCatalog, TODAY)).toMatchObject({
      day: new Date(`${day}T00:00:00.000Z`),
      paymentMethodId: 'method-yape',
    })
  })

  it('should accept a name written a little differently and the category', () => {
    expect(parseSavedSearch('danary comida', mockCatalog, TODAY)).toMatchObject({
      personId: 'person-danery',
      categoryId: 'category-food',
    })
  })
})
