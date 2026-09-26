import { hashPassword, verifyPassword } from './password.helper'

describe('password helper', () => {
  it('should verify the password it hashed and no other', async () => {
    const stored = await hashPassword('correcto-caballo-1')

    expect(await verifyPassword('correcto-caballo-1', stored)).toBe(true)
    expect(await verifyPassword('correcto-caballo-2', stored)).toBe(false)
  })

  it('should salt every hash: the same password is never stored twice the same way', async () => {
    expect(await hashPassword('igual-igual-1')).not.toBe(await hashPassword('igual-igual-1'))
  })

  it('should refuse when there is no password or the stored value is not one of ours', async () => {
    expect(await verifyPassword('x', null)).toBe(false)
    expect(await verifyPassword('x', 'plaintext')).toBe(false)
  })
})
