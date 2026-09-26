import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

// scrypt with a random salt, in Node's own crypto: no native module to build (argon2 of D83 needs one). Stored as
// `scrypt$<salt>$<hash>` in base64
const KEY_LENGTH = 64

const derive = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, (error, key) => (error ? reject(error) : resolve(key))),
  )

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('base64')}$${(await derive(password, salt)).toString('base64')}`
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const [scheme, salt, hash] = (stored ?? '').split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const actual = await derive(password, Buffer.from(salt, 'base64'))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
