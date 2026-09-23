import { mockExtractedExpense } from '../mocks/expense-extraction.mock'

import { expenseExtractionJsonSchema, expenseExtractionSchema } from './expense-extraction.validation'

describe('expenseExtractionSchema', () => {
  it('should accept a valid extraction and an empty one', () => {
    expect(expenseExtractionSchema.safeParse({ expenses: [mockExtractedExpense] }).success).toBe(true)
    expect(expenseExtractionSchema.safeParse({ expenses: [] }).success).toBe(true)
  })

  it.each([
    ['a negative amount', { amount: -5 }],
    ['an installment that is not n/m', { installment: '2 de 6' }],
    ['a date that is not YYYY-MM-DD', { spentAt: '22/09/2026' }],
    ['an unknown destination', { destination: 'costo_fijo' }],
    ['a confidence above 1', { confidence: { amount: 1.5 } }],
  ])('should reject %s', (_case, override) => {
    const result = expenseExtractionSchema.safeParse({ expenses: [{ ...mockExtractedExpense, ...override }] })

    expect(result.success).toBe(false)
  })

  it('should reject more than 10 expenses', () => {
    const expenses = Array.from({ length: 11 }, () => mockExtractedExpense)

    expect(expenseExtractionSchema.safeParse({ expenses }).success).toBe(false)
  })

  it('should export a JSON Schema without the $schema keyword', () => {
    expect(expenseExtractionJsonSchema.$schema).toBeUndefined()
    expect(expenseExtractionJsonSchema.type).toBe('object')
    expect(expenseExtractionJsonSchema.required).toEqual(['expenses'])
  })
})
