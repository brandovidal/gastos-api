import { LogSanitizer } from './log-sanitizer.helper'

describe('LogSanitizer', () => {
  it('should redact sensitive keys', () => {
    const result = LogSanitizer.sanitize({ apiKey: 'secret', token: 'abc', amount: 10 })

    expect(result).toEqual({ apiKey: '[REDACTED]', token: '[REDACTED]', amount: 10 })
  })

  it('should truncate long strings', () => {
    const result = LogSanitizer.sanitize('a'.repeat(600)) as string

    expect(result.startsWith('a'.repeat(500))).toBe(true)
    expect(result).toContain('(+100 chars)')
  })

  it('should limit array items', () => {
    const result = LogSanitizer.sanitize([1, 2, 3, 4, 5, 6, 7]) as unknown[]

    expect(result).toHaveLength(6)
    expect(result[5]).toBe('… (+2 more items)')
  })

  it('should keep null and primitive values', () => {
    expect(LogSanitizer.sanitize(null)).toBeNull()
    expect(LogSanitizer.sanitize(42)).toBe(42)
  })
})
