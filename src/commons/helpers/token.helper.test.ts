import { generateToken, hashToken, parseCookies, serializeCookie } from './token.helper'

describe('token helper', () => {
  it('should give an unguessable token whose hash is what the database keeps', () => {
    const token = generateToken()

    expect(token).toMatch(/^[\w-]{43}$/)
    expect(generateToken()).not.toBe(token)
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(token)).not.toContain(token)
  })

  it('should read the cookies of a request', () => {
    expect(parseCookies('a=1; kogane_session=abc%20def; b=2')).toEqual({ a: '1', kogane_session: 'abc def', b: '2' })
    expect(parseCookies(undefined)).toEqual({})
  })

  it('should write a cookie the page cannot read, that only travels on the site, and is Secure in production', () => {
    expect(serializeCookie('kogane_session', 't', { maxAgeSeconds: 60, secure: true })).toBe(
      'kogane_session=t; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; Secure',
    )
    expect(serializeCookie('kogane_session', '', { maxAgeSeconds: 0, secure: false })).not.toContain('Secure')
  })
})
