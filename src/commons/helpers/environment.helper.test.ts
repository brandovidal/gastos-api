import { isDocsEnabled } from './environment.helper'

describe('isDocsEnabled', () => {
  it('should serve Swagger locally and in tests, never in production', () => {
    expect(isDocsEnabled('dev')).toBe(true)
    expect(isDocsEnabled(undefined)).toBe(true)
    expect(isDocsEnabled('test')).toBe(true)
    expect(isDocsEnabled('production')).toBe(false)
  })
})
