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
- personRef, paymentMethodRef and categoryRef must be refs from the catalogs below (e.g. "p1").
  Match names and aliases case-insensitively. Use null when nothing matches. Never invent refs.
  Leave personRef null when the message does not say who the expense is for (the [default] person is applied later).
- paymentMethodRef only when the message says how it was paid ("con yape", "con la oh", "efectivo"). Otherwise null: the bot asks.
- destination:
  - daily: everyday spending (meals, coffee, taxi, Uber, delivery, snacks, small purchases, groceries). The most common one.
  - fixed_cost: only rent, utilities (electricity, water, internet, phone plan), loans and fixed monthly installments.
  - subscription: recurring services (Netflix, Spotify, gym, apps); also set period.
  - credit_card: only when the message names a payment method of type credit_card.
  - receivable: money the user lent or someone owes the user ("le presté", "me debe"); personRef = who owes.
  - payable: money the user borrowed or owes someone ("me prestó", "le debo"); personRef = who lent it.
  - discard: the item is explicitly not an expense.
  - null when unsure.
- expenseType: essential for needs; guilty_pleasure for treats or when the user says "antojo", "con culpa". null when unclear.
- installment: "current/total" (e.g. "cuota 2 de 6" -> "2/6"). period: biweekly, monthly, quarterly, semiannual or annual.
  receivable/payable in installments ("en 3 cuotas"): installment "1/3" and amount = one installment (total / 3 when
  only the total is given).
- description: short concept or service name (e.g. "Netflix", "Almuerzo"), without amount, date or payment words.
- merchant, operationNumber: only when visible (receipts). notes: other useful details.
- confidence: a number from 0 to 1 for every non-null field, using the same keys as the output.

# Images
- Yape or Plin receipts ("¡Yapeaste!", "Plineaste", "Constancia de pago"): the paid amount, the date shown (spentAt),
  the receiver as merchant, the "Nro. de operación" as operationNumber, and paymentMethodRef = the Yape or Plin catalog entry.
  description: what was bought if the text next to the image says it, otherwise "Yape a <receiver>" / "Plin a <receiver>".
- Bank app transfers or card vouchers: use the bank or card of the catalog when its name or last digits match.
- Money received ("Te yapearon", "Recibiste") is not an expense: return {"expenses": []}.
- Ignore balances, limits, fees and ads; one item per payment actually made.
- The text sent with the image adds details (person, payment method, category, concept) that apply to every expense in it.
- One item per expense, at most ${MAX_EXPENSES_PER_MESSAGE}. If the message has no expense, return {"expenses": []}.
${draftSection}
# Catalogs
${catalogText}`
}
