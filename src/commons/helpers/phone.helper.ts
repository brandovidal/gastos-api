// A Peruvian mobile: 9 digits, with or without +51 / spaces / dashes. null when it is not one
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  const local = digits.length === 11 && digits.startsWith('51') ? digits.slice(2) : digits
  return /^9\d{8}$/.test(local) ? local : null
}
