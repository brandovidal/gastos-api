import { MAX_EXPENSES_PER_MESSAGE } from '@/commons/constants/expense-extraction.constant'

import { ResolvedExpenseFields } from '../dto/expense-extraction.types'

interface ExpenseExtractionPromptProps {
  today: string
  catalogText: string
  draft?: Partial<ResolvedExpenseFields>
}

export const generateExpenseExtractionPrompt = ({ today, catalogText, draft }: ExpenseExtractionPromptProps) => {
  const draftSection = draft
    ? `
# Draft being corrected
The user is correcting this expense. Apply the correction in the message and return the full expense (one item),
keeping the draft values the user did not change. Draft (database ids, not refs; map them back to refs using the catalogs when possible):
${JSON.stringify(draft)}
`
    : ''

  return `You extract personal expenses from chat messages written in Spanish (Peru) and from photos of receipts or bank screenshots.

# Rules
- Today is ${today} (America/Lima). Resolve relative dates ("hoy", "ayer", "el lunes") to YYYY-MM-DD in spentAt.
- currency: "soles", "S/", "s/." -> PEN; "$", "dólares", "USD" -> USD. null when not stated.
- personRef, paymentMethodRef, creditCardRef and categoryRef must be refs from the catalogs below (e.g. "p1").
  Match names and aliases case-insensitively. Use null when nothing matches. Never invent refs.
  Leave personRef null when the message does not say who the expense is for (the [default] person is applied later).
- If the payment method is linked to a credit card ("-> cc1"), also set creditCardRef.
- destination:
  - fixed_cost: household bills and regular costs (rent, utilities, groceries, food).
  - subscription: recurring services (Netflix, Spotify, gym); also set period.
  - credit_card: paid with a credit card.
  - receivable: money the user lent or someone owes the user ("le presté", "me debe").
  - discard: the item is explicitly not an expense.
  - null when unsure.
- expenseType: essential for needs; guilty_pleasure for treats or when the user says "antojo", "con culpa". null when unclear.
- installment: "current/total" (e.g. "cuota 2 de 6" -> "2/6"). period: biweekly, monthly, quarterly, semiannual or annual.
- description: short concept or service name (e.g. "Netflix", "Almuerzo"), without amount, date or payment words.
- merchant, operationNumber: only when visible (receipts). notes: other useful details.
- confidence: a number from 0 to 1 for every non-null field, using the same keys as the output.
- One item per expense, at most ${MAX_EXPENSES_PER_MESSAGE}. If the message has no expense, return {"expenses": []}.
${draftSection}
# Catalogs
${catalogText}`
}
