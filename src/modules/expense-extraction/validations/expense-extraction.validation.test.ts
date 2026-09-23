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

  it('should not use keywords that make Gemini reject the schema (400 INVALID_ARGUMENT)', () => {
    const offending: string[] = []
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== 'object') return
      for (const [key, value] of Object.entries(node)) {
        if (key === 'additionalProperties' && typeof value === 'object') offending.push(path)
        if (key === 'propertyNames') offending.push(`${path}.propertyNames`)
        if (key === 'maxItems') offending.push(`${path}.maxItems`)
        walk(value, `${path}.${key}`)
      }
    }
    walk(expenseExtractionJsonSchema, '$')

    expect(offending).toEqual([])
  })

  it('should accept partial confidence and drop unknown confidence keys', () => {
    const result = expenseExtractionSchema.parse({
      expenses: [{ ...mockExtractedExpense, confidence: { amount: 0.9, madeUp: 0.2 } }],
    })

    expect(result.expenses[0].confidence).toEqual({ amount: 0.9 })
  })
})
