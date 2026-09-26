import { z } from 'zod'

import { Currency } from '@/commons/constants/expense.constant'

import { lockCancelledStatementRows, ParsedStatement } from './statement.parser'

// The AI reads only the extracted text of the statement (never the PDF nor the document number, D94, D95)
export const STATEMENT_INSTRUCTIONS = `You read the text of a Peruvian credit card statement (estado de cuenta).
Return JSON with:
- cardName: the card as printed (e.g. "Sip", "American Express Green", "iO", "CMR").
- holderName: the cardholder's name as printed (titular / cliente), or null.
- periodEnd: closing date of the billing period (YYYY-MM-DD) or null.
- dueDate: last day to pay (YYYY-MM-DD) or null.
- totalDue: total amount to pay of this statement, or null. minimumDue: minimum payment, or null.
- previousBalance: "saldo mes anterior" before payments, or null. previousPayments: total payments/credits applied against
  that balance as a positive number, or null. monthlyPayment: the amount labelled "pago del mes", or null.
- currency: "PEN" or "USD" of the totals.
- movements: every purchase and every individual charge of the period, one per line of the statement: date (YYYY-MM-DD,
  the processing date when there are two), description as printed, amount (positive for charges, negative for annulments), currency, installment "n/m"
  when the line is an installment of a purchase, otherwise null. Include itemized compensatory or late interest, insurance,
  fees, commissions and taxes (for example ITF).
Leave out payments to the card except a payment line that is explicitly part of a purchase cancellation; leave out the
previous balance, totals and explanatory interest summaries that are not individual movements. Keep both the original
purchase and its matching "ANULACION" / reversal as movements with equal opposite amounts. Never omit an itemized charge
because it is interest or a fee.
Do not invent movements: if the text has none, return an empty list.`

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()

export const statementAiSchema = z.object({
  cardName: z.string().nullable(),
  holderName: z.string().nullable().optional(), // optional: answers recorded before it still parse
  periodEnd: day,
  dueDate: day,
  totalDue: z.number().nullable(),
  minimumDue: z.number().nullable(),
  previousBalance: z.number().nonnegative().nullable().optional(),
  previousPayments: z.number().nonnegative().nullable().optional(),
  monthlyPayment: z.number().nonnegative().nullable().optional(),
  currency: z.enum(Currency),
  movements: z.array(
    z.object({
      date: day,
      description: z.string().min(1),
      amount: z.number().refine((amount) => amount !== 0),
      currency: z.enum(Currency),
      installment: z
        .string()
        .regex(/^\d{1,3}\/\d{1,3}$/)
        .nullable(),
    }),
  ),
})

// Without $schema, as expenseExtractionJsonSchema (Gemini rejects it)
export const statementAiJsonSchema = (() => {
  const { $schema: _schema, ...jsonSchema } = z.toJSONSchema(statementAiSchema) as Record<string, unknown>
  return jsonSchema
})()

export type StatementAiOutput = z.infer<typeof statementAiSchema>

export function fromAi(output: StatementAiOutput, cardHint: string | null): ParsedStatement {
  const previousBalance = output.previousBalance ?? null
  const previousPayments = output.previousPayments ?? (previousBalance != null ? 0 : null)
  const monthlyPayment = output.monthlyPayment ?? null
  const rows = output.movements.map((movement) => ({ ...movement }))
  if (previousBalance != null && previousPayments != null) {
    const remainder = Math.round((previousBalance - previousPayments) * 100) / 100
    if (remainder > 0) {
      rows.push({
        date: null,
        description: `Saldo mes anterior neto (${previousBalance.toFixed(2)} - ${previousPayments.toFixed(2)})`,
        amount: remainder,
        currency: output.currency,
        installment: null,
      })
    }
  }
  return {
    cardHint,
    holderName: output.holderName ?? null,
    cardName: output.cardName,
    periodEnd: output.periodEnd,
    dueDate: output.dueDate,
    totalDue: output.totalDue ?? monthlyPayment,
    minimumDue: output.minimumDue,
    previousBalance,
    previousPayments,
    monthlyPayment,
    currency: output.currency,
    rows: lockCancelledStatementRows(rows),
  }
}
