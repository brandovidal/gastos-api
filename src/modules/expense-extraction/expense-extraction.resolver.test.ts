import { Currency, ExpenseDestination, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'

import { buildExtractionCatalog } from './expense-extraction.catalog'
import { completeExpense, resolveExpense } from './expense-extraction.resolver'
import { mockCatalogSource, mockExtractedExpense } from './mocks/expense-extraction.mock'

describe('resolveExpense', () => {
  const catalog = buildExtractionCatalog(mockCatalogSource)
  const today = '2026-09-22'

  it('should map refs to database ids and apply defaults', () => {
    const expense = resolveExpense(mockExtractedExpense, catalog, today)

    expect(expense.personId).toBe('person-danery')
    expect(expense.paymentMethodId).toBe('method-yape')
    expect(expense.categoryId).toBe('category-food')
    expect(expense.currency).toBe(Currency.PEN)
    expect(expense.spentAt).toBe(today)
  })

  it('should ask for the destination when the AI did not decide it', () => {
    const expense = resolveExpense(mockExtractedExpense, catalog, today)

    expect(expense.missingFields).toEqual([ExpenseField.DESTINATION])
  })

  it('should drop invented refs and ask for those fields', () => {
    const expense = resolveExpense(
      { ...mockExtractedExpense, destination: ExpenseDestination.FIXED_COST, categoryRef: 'x1' },
      catalog,
      today,
    )

    expect(expense.categoryId).toBeNull()
    expect(expense.missingFields).toEqual([ExpenseField.CATEGORY])
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

  it('should fill the credit card and destination from a payment method linked to a card', () => {
    const expense = resolveExpense({ ...mockExtractedExpense, paymentMethodRef: 'pm2' }, catalog, today)

    expect(expense.creditCardId).toBe('card-oh')
    expect(expense.destination).toBe(ExpenseDestination.CREDIT_CARD)
    expect(expense.missingFields).toEqual([])
  })

  it('should keep the destination chosen by the AI', () => {
    const expense = resolveExpense(
      { ...mockExtractedExpense, paymentMethodRef: 'pm2', destination: ExpenseDestination.SUBSCRIPTION },
      catalog,
      today,
    )

    expect(expense.destination).toBe(ExpenseDestination.SUBSCRIPTION)
    expect(expense.missingFields).toEqual([ExpenseField.PERIOD])
  })

  it('should store confidence with field names and flag low confidence values', () => {
    const expense = resolveExpense(mockExtractedExpense, catalog, today)

    expect(expense.confidence).toEqual({ description: 0.95, amount: 0.99, personId: 0.5 })
    expect(expense.lowConfidenceFields).toEqual([ExpenseField.PERSON])
  })
})

describe('completeExpense', () => {
  const base = {
    destination: ExpenseDestination.SUBSCRIPTION,
    description: 'Netflix',
    amount: 45,
    currency: Currency.PEN,
    spentAt: '2026-09-22',
    expenseType: null,
    installment: null,
    period: SubscriptionPeriod.MONTHLY,
    personId: 'person-brando',
    paymentMethodId: 'method-yape',
    creditCardId: null,
    categoryId: null,
    merchant: null,
    operationNumber: null,
    notes: null,
  }

  it('should not require a category for subscriptions', () => {
    expect(completeExpense(base, {}).missingFields).toEqual([])
  })

  it('should require nothing for discarded items', () => {
    expect(
      completeExpense({ ...base, destination: ExpenseDestination.DISCARD, amount: null }, {}).missingFields,
    ).toEqual([])
  })

  it('should turn an expense with a credit card and no destination into a credit card expense', () => {
    const expense = completeExpense({ ...base, destination: null, creditCardId: 'card-oh' }, {})

    expect(expense.destination).toBe(ExpenseDestination.CREDIT_CARD)
  })

  it('should require the credit card for credit card expenses', () => {
    const expense = completeExpense({ ...base, destination: ExpenseDestination.CREDIT_CARD }, {})

    expect(expense.missingFields).toEqual([ExpenseField.CREDIT_CARD])
  })
})
