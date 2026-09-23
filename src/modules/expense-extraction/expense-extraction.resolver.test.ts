import { Currency, ExpenseDestination, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'

import { buildExtractionCatalog } from './expense-extraction.catalog'
import { applyPaymentMethodRule, completeExpense, resolveExpense } from './expense-extraction.resolver'
import { ResolvedExpenseFields } from './dto/expense-extraction.types'
import { mockCatalogSource, mockExtractedExpense } from './mocks/expense-extraction.mock'

const catalog = buildExtractionCatalog(mockCatalogSource)
const today = '2026-09-22'

const base: ResolvedExpenseFields = {
  destination: ExpenseDestination.DAILY,
  description: 'Almuerzo',
  amount: 25,
  currency: Currency.PEN,
  spentAt: today,
  expenseType: null,
  installment: null,
  period: null,
  personId: 'person-brando',
  paymentMethodId: 'method-yape',
  categoryId: null,
  merchant: null,
  operationNumber: null,
  notes: null,
}

describe('resolveExpense', () => {
  it('should map refs to database ids and apply defaults', () => {
    const expense = resolveExpense(mockExtractedExpense, catalog, today)

    expect(expense.personId).toBe('person-danery')
    expect(expense.paymentMethodId).toBe('method-yape')
    expect(expense.categoryId).toBe('category-food')
    expect(expense.currency).toBe(Currency.PEN)
    expect(expense.spentAt).toBe(today)
  })

  it('should ask for the destination when the AI did not decide it and the method is not a card', () => {
    expect(resolveExpense(mockExtractedExpense, catalog, today).missingFields).toEqual([ExpenseField.DESTINATION])
  })

  it('should drop invented refs and ask for those fields', () => {
    const expense = resolveExpense(
      {
        ...mockExtractedExpense,
        destination: ExpenseDestination.FIXED_COST,
        categoryRef: 'x1',
        paymentMethodRef: 'pm9',
      },
      catalog,
      today,
    )

    expect(expense.categoryId).toBeNull()
    expect(expense.missingFields).toEqual([ExpenseField.CATEGORY, ExpenseField.PAYMENT_METHOD])
  })

  it('should ask how it was paid for day-to-day expenses', () => {
    const expense = resolveExpense(
      { ...mockExtractedExpense, destination: ExpenseDestination.DAILY, paymentMethodRef: null },
      catalog,
      today,
    )

    expect(expense.missingFields).toEqual([ExpenseField.PAYMENT_METHOD])
  })

  it('should assign the default person when the message does not say who (D19)', () => {
    expect(resolveExpense({ ...mockExtractedExpense, personRef: null }, catalog, today).personId).toBe('person-brando')
    expect(resolveExpense({ ...mockExtractedExpense, personRef: 'p99' }, catalog, today).personId).toBe('person-brando')
  })

  it('should leave the person empty when there is no default person', () => {
    const withoutDefault = buildExtractionCatalog({
      ...mockCatalogSource,
      people: mockCatalogSource.people.map((person) => ({ ...person, isDefault: false })),
    })

    expect(resolveExpense({ ...mockExtractedExpense, personRef: null }, withoutDefault, today).personId).toBeNull()
  })

  it('should store confidence with field names and flag low confidence values', () => {
    const expense = resolveExpense(mockExtractedExpense, catalog, today)

    expect(expense.confidence).toEqual({ description: 0.95, amount: 0.99, personId: 0.5 })
    expect(expense.lowConfidenceFields).toEqual([ExpenseField.PERSON])
  })
})

describe('applyPaymentMethodRule', () => {
  it.each([
    [
      'a expense draft paid with a credit card',
      ExpenseDestination.DAILY,
      'method-ohpay',
      ExpenseDestination.CREDIT_CARD,
    ],
    ['an undecided expense paid with a credit card', null, 'method-ohpay', ExpenseDestination.CREDIT_CARD],
    ['a card expense paid with Yape', ExpenseDestination.CREDIT_CARD, 'method-yape', ExpenseDestination.DAILY],
    ['a fixed cost paid with a card', ExpenseDestination.FIXED_COST, 'method-ohpay', ExpenseDestination.FIXED_COST],
    ['a expense draft paid with Yape', ExpenseDestination.DAILY, 'method-yape', ExpenseDestination.DAILY],
    ['an expense without payment method', ExpenseDestination.CREDIT_CARD, null, ExpenseDestination.CREDIT_CARD],
  ])('%s', (_case, destination, paymentMethodId, expected) => {
    expect(applyPaymentMethodRule({ ...base, destination, paymentMethodId }, catalog).destination).toBe(expected)
  })
})

describe('completeExpense', () => {
  it('should require concept, amount and payment method for day-to-day expenses', () => {
    expect(completeExpense(base, {}, catalog).missingFields).toEqual([])
    expect(completeExpense({ ...base, paymentMethodId: null, amount: null }, {}, catalog).missingFields).toEqual([
      ExpenseField.AMOUNT,
      ExpenseField.PAYMENT_METHOD,
    ])
  })

  it('should not require a category for subscriptions', () => {
    const subscription = { ...base, destination: ExpenseDestination.SUBSCRIPTION, period: SubscriptionPeriod.MONTHLY }

    expect(completeExpense(subscription, {}, catalog).missingFields).toEqual([])
  })

  it('should require nothing for discarded items', () => {
    expect(
      completeExpense({ ...base, destination: ExpenseDestination.DISCARD, amount: null }, {}, catalog).missingFields,
    ).toEqual([])
  })

  it('should turn an expense paid with a credit card and no destination into a credit card expense', () => {
    const expense = completeExpense({ ...base, destination: null, paymentMethodId: 'method-ohpay' }, {}, catalog)

    expect(expense.destination).toBe(ExpenseDestination.CREDIT_CARD)
    expect(expense.missingFields).toEqual([])
  })
})
