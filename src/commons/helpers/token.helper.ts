import { createHash, randomBytes } from 'node:crypto'

// Sessions, invitations and link codes are random tokens: the browser (or the person) keeps the token, the database
// only its SHA-256, so a leaked table opens nothing
export const generateToken = (bytes = 32): string => randomBytes(bytes).toString('base64url')

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

// The short code of a Telegram link (typed by nobody: it travels in the t.me deep link)
export const generateLinkCode = (): string => generateToken(12)

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return cookies
}

export function serializeCookie(
  name: string,
  value: string,
  options: { maxAgeSeconds: number; secure: boolean },
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAgeSeconds}`,
    ...(options.secure ? ['Secure'] : []),
  ].join('; ')
}
