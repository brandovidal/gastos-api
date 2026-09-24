import { normalizeText } from '@/modules/expense-extraction/expense-extraction.catalog'

// Bank apps cut long names ("MP*MERCADOLI..."): compare the letters and digits only, and a prefix is enough
const key = (text: string | null | undefined) => normalizeText(text ?? '').replace(/[^a-z0-9]/g, '')

const MIN_KEY_LENGTH = 3

// The same merchant or concept seen in two overlapping screenshots (P21)
export function sameMerchant(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = key(a)
  const right = key(b)
  if (left.length < MIN_KEY_LENGTH || right.length < MIN_KEY_LENGTH) return false
  return left.startsWith(right) || right.startsWith(left)
}
