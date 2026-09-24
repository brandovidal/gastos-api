import { normalizeText } from '@/modules/expense-extraction/expense-extraction.catalog'

import { MONTH_NAMES } from './conversation.messages'

export interface MonthArg {
  month: number
  year: number
}

// "/presupuesto octubre", "/presupuesto oct 2026", "/presupuesto 10", "/presupuesto 10 2026"; empty → this month.
// Null when the text is not a month, so the command can explain the format.
export function parseMonthArg(args: string, today: string): MonthArg | null {
  const current = { month: Number(today.slice(5, 7)), year: Number(today.slice(0, 4)) }
  const words = normalizeText(args)
    .split(/[\s/-]+/)
    .filter(Boolean)
  if (!words.length) return current

  const [monthWord, yearWord] = words
  // "septiembre" is also written "setiembre" (the name used in Peru and in the bot)
  const name = monthWord.replace(/^sept?/, 'set')
  const month = /^\d{1,2}$/.test(monthWord)
    ? Number(monthWord)
    : MONTH_NAMES.findIndex((candidate) => name.length >= 3 && candidate.startsWith(name)) + 1
  const year = yearWord == null ? current.year : /^\d{4}$/.test(yearWord) ? Number(yearWord) : NaN

  if (!(month >= 1 && month <= 12) || !Number.isInteger(year) || words.length > 2) return null
  return { month, year }
}
