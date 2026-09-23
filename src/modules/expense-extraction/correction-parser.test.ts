import { Currency, ExpenseDestination, ExpenseType, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'

import { parseCorrection } from './correction-parser'
import { buildExtractionCatalog } from './expense-extraction.catalog'
import { mockCatalogSource } from './mocks/expense-extraction.mock'

describe('parseCorrection', () => {
  const catalog = buildExtractionCatalog(mockCatalogSource)
  const today = '2026-09-22'
  const parse = (text: string, pendingField: ExpenseField | null = null) =>
    parseCorrection(text, pendingField, catalog, today)

  describe('answer to the pending field', () => {
    it.each([
      [ExpenseField.PERSON, 'dany', { personId: 'person-danery' }],
      [ExpenseField.PAYMENT_METHOD, 'Yape', { paymentMethodId: 'method-yape' }],
      [ExpenseField.PAYMENT_METHOD, 'la oh', { paymentMethodId: 'method-ohpay' }],
      [ExpenseField.PAYMENT_METHOD, 'oh', { paymentMethodId: 'method-ohpay' }],
      [ExpenseField.CATEGORY, 'comida', { categoryId: 'category-food' }],
      [ExpenseField.AMOUNT, '30.50', { amount: 30.5 }],
      [ExpenseField.INSTALLMENT, '2 de 6', { installment: '2/6' }],
      [ExpenseField.PERIOD, 'mensual', { period: SubscriptionPeriod.MONTHLY }],
      [ExpenseField.DESTINATION, 'me debe', { destination: ExpenseDestination.RECEIVABLE }],
      [ExpenseField.DESTINATION, 'día a día', { destination: ExpenseDestination.DAILY }],
      [ExpenseField.SPENT_AT, 'ayer', { spentAt: '2026-09-21' }],
      [ExpenseField.DESCRIPTION, 'Menú del día', { description: 'Menú del día' }],
    ])('should read %s from "%s"', (field, text, expected) => {
      expect(parse(text, field)).toEqual(expected)
    })

    it('should fall back to keywords when the answer does not fit the pending field', () => {
      expect(parse('monto 40', ExpenseField.PERSON)).toEqual({ amount: 40 })
    })
  })

  describe('keyword corrections', () => {
    it('should read several corrections in one message', () => {
      expect(parse('persona dany, cuota 2/6, s/ 120')).toEqual({
        personId: 'person-danery',
        installment: '2/6',
        amount: 120,
        currency: Currency.PEN,
      })
    })

    it('should read payment method, category, type and date', () => {
      expect(parse('pagué con yape, categoría comida, con culpa, ayer')).toEqual({
        paymentMethodId: 'method-yape',
        categoryId: 'category-food',
        expenseType: ExpenseType.GUILTY_PLEASURE,
        spentAt: '2026-09-21',
      })
    })

    it('should read dates and USD amounts', () => {
      expect(parse('fecha 5/9, monto 20 dolares')).toEqual({
        spentAt: '2026-09-05',
        amount: 20,
        currency: Currency.USD,
      })
    })

    it('should not read an installment as a date', () => {
      expect(parse('cuota 2/6, el 5/9')).toEqual({ installment: '2/6', spentAt: '2026-09-05' })
    })

    it('should read a new description', () => {
      expect(parse('concepto: Cena aniversario')).toEqual({ description: 'Cena aniversario' })
    })

    it('should treat messages that do not start with a keyword as new expenses', () => {
      expect(parse('taxi 15 soles ayer')).toBeNull()
      expect(parse('taxi 15 soles', ExpenseField.CATEGORY)).toBeNull()
    })

    it('should return null when nothing is understood, so the AI takes over', () => {
      expect(parse('mejor cámbialo todo, era otra cosa')).toBeNull()
      expect(parse('   ')).toBeNull()
    })
  })
})
