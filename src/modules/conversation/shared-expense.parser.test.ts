import { parseSharedExpense, sharesOf } from './shared-expense.parser'
import { mockCatalog } from './mocks/conversation.mock'

describe('parseSharedExpense', () => {
  it.each([
    ['cena 120 con dany, mitad', 'cena 120'],
    ['Cena 120 con Danery a medias', 'Cena 120'],
    ['pizza 90 a medias con dany', 'pizza 90'],
    ['menú 30 con dany, la mitad.', 'menú 30'],
    ['cena 120 con yape con dany, mitad', 'cena 120 con yape'],
    ['netflix 52.90 mensual con io, a medias con dany', 'netflix 52.90 mensual con io'],
  ])('should read "%s" as shared in halves with Danery', (text, rest) => {
    expect(parseSharedExpense(text, mockCatalog)).toEqual({
      text: rest,
      sharedWith: { personIds: ['person-danery'], parts: 2 },
    })
  })

  it('should take "entre N" as the number of parts', () => {
    expect(parseSharedExpense('taxi 60 entre 3 con dany', mockCatalog)?.sharedWith).toEqual({
      personIds: ['person-danery'],
      parts: 3,
    })
  })

  it.each([
    'almuerzo 25 con yape',
    'cena 120 con juan, mitad', // not a person of the catalog
    'con dany, mitad', // nothing left as the expense
    'le presté 100 a dany',
  ])('should leave "%s" to the AI', (text) => {
    expect(parseSharedExpense(text, mockCatalog)).toBeNull()
  })

  it('should give each one the same part and the cents left to the user', () => {
    expect(sharesOf(120, { personIds: ['a'], parts: 2 })).toEqual({ share: 60, own: 60 })
    expect(sharesOf(100, { personIds: ['a', 'b'], parts: 3 })).toEqual({ share: 33.33, own: 33.34 })
  })
})
