import { normalizePhone } from './phone.helper'

describe('normalizePhone', () => {
  it('should keep the 9 digits of a mobile however it is written', () => {
    expect(normalizePhone('930764207')).toBe('930764207')
    expect(normalizePhone('+51 930 764 207')).toBe('930764207')
    expect(normalizePhone('930-764-207')).toBe('930764207')
  })

  it('should refuse what is not a mobile', () => {
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('830764207')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })
})
