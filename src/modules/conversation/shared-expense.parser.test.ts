import { parseShare, parseShareCorrection, parseSharedExpense, sharesOf } from './shared-expense.parser'
import { mockCatalog } from './mocks/conversation.mock'

const half = { shares: [{ personId: 'person-danery', ratio: 1 / 2 }] }

describe('parseSharedExpense (D73, D74)', () => {
  it.each([
    ['cena 120 con dany, mitad', 'cena 120'],
    ['Cena 120 con Danery a medias', 'Cena 120'],
    ['pizza 90 a medias con dany', 'pizza 90'],
    ['menú 30 con dany, la mitad.', 'menú 30'],
    ['cena 120 con yape con dany, mitad', 'cena 120 con yape'],
    ['netflix 52.90 mensual con io, a medias con dany', 'netflix 52.90 mensual con io'],
    // a voice note: "compartido" and "y yo" say it is shared; "Danary" is close enough to Danery
    [
      'Quiero establecer un pago compartido de Netflix de 64 soles con Danary y yo.',
      'Quiero establecer un pago de Netflix de 64 soles',
    ],
  ])('should read "%s" as shared in halves with Danery', (text, rest) => {
    expect(parseSharedExpense(text, mockCatalog)).toEqual({ text: rest, sharedWith: half })
  })

  it.each([
    ['taxi 60 entre 3 con dany', { ratio: 1 / 3 }],
    ['netflix 64 con dany la tercera parte', { ratio: 1 / 3 }],
    ['luz 200 con dany 30%', { ratio: 0.3 }],
    ['luz 200 con dany 20 por ciento', { ratio: 0.2 }],
    ['netflix 64, dany paga 20', { amount: 20 }],
  ])('should read the part of "%s"', (text, share) => {
    expect(parseSharedExpense(text, mockCatalog)?.sharedWith).toEqual({
      shares: [{ personId: 'person-danery', ...share }],
    })
  })

  it.each([
    'almuerzo 25 con yape',
    'almuerzo con dany 25', // with Danery, but nothing says it is shared
    'cena 120 con juan, mitad', // not a person of the catalog
    'con dany, mitad', // nothing left as the expense
    'le presté 100 a dany',
  ])('should leave "%s" to the AI', (text) => {
    expect(parseSharedExpense(text, mockCatalog)).toBeNull()
  })

  it.each([
    ['30%', { ratio: 0.3 }],
    ['la mitad', { ratio: 0.5 }],
    ['un tercio', { ratio: 1 / 3 }],
    ['20', { amount: 20 }],
    ['15.50 soles', { amount: 15.5 }],
    ['algo', null],
  ])('should read the part "%s" typed after ✏️', (text, share) => {
    expect(parseShare(text)).toEqual(share)
  })

  it('should give each one their part, what they owe together and the cents left to the user', () => {
    expect(sharesOf(64, half)).toEqual({ parts: [{ personId: 'person-danery', amount: 32 }], othersShare: 32, own: 32 })
    expect(
      sharesOf(100, {
        shares: [
          { personId: 'a', ratio: 1 / 3 },
          { personId: 'b', amount: 20 },
        ],
      }),
    ).toEqual({
      parts: [
        { personId: 'a', amount: 33.33 },
        { personId: 'b', amount: 20 },
      ],
      othersShare: 53.33,
      own: 46.67,
    })
    // never more than the total
    expect(sharesOf(10, { shares: [{ personId: 'a', amount: 30 }] }).othersShare).toBe(10)
  })

  it.each(['compartido con dany a medias', 'a medias con dany', 'dany paga 20', 'con dany y yo'])(
    'should read "%s" as the split of the open expense',
    (text) => {
      expect(parseShareCorrection(text, mockCatalog)?.shares[0].personId).toBe('person-danery')
    },
  )

  it.each(['monto 30', 'persona dany', 'cena 120 con dany, mitad'])('should not read "%s" as only a split', (text) => {
    expect(parseShareCorrection(text, mockCatalog)).toBeNull()
  })
})
