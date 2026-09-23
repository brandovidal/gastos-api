import { DebtDirection } from '@/commons/constants/debt.constant'

import { parseDebtPayment } from './debt-payment.parser'
import { mockCatalog } from './mocks/conversation.mock'

describe('parseDebtPayment', () => {
  it.each([
    ['dany me pagó 150', DebtDirection.OWED_TO_ME, 150],
    ['Dany me yapeó S/ 80.50', DebtDirection.OWED_TO_ME, 80.5],
    ['danery me devolvió 20 soles', DebtDirection.OWED_TO_ME, 20],
    ['abono 150 dany', DebtDirection.OWED_TO_ME, 150],
    ['abono de 75,5 de danery', DebtDirection.OWED_TO_ME, 75.5],
    ['me pagaron 40 dany', DebtDirection.OWED_TO_ME, 40],
    ['le pagué 50 a dany', DebtDirection.I_OWE, 50],
    ['devolví 30 a mi esposa!', DebtDirection.I_OWE, 30],
  ])('should read "%s"', (text, direction, amount) => {
    expect(parseDebtPayment(text, mockCatalog)).toEqual({ personId: 'person-danery', direction, amount })
  })

  it.each([
    ['an expense', 'almuerzo 25 soles con yape'],
    ['a longer sentence (goes to the AI)', 'le pagué 50 a dany por el almuerzo'],
    ['someone out of the catalog', 'pedro me pagó 100'],
    ['a zero amount', 'dany me pagó 0'],
    ['a loan, not a payment', 'le presté 100 a dany'],
  ])('should ignore %s', (_case, text) => {
    expect(parseDebtPayment(text, mockCatalog)).toBeNull()
  })
})
