import { z } from 'zod'

import { Currency } from '@/commons/constants/expense.constant'

import { ParsedStatement } from './statement.parser'

// The AI reads only the extracted text of the statement (never the PDF nor the document number, D94, D95)
export const STATEMENT_INSTRUCTIONS = `You read the text of a Peruvian credit card statement (estado de cuenta).
Return JSON with:
- cardName: the card as printed (e.g. "Sip", "American Express Green", "iO", "CMR").
- periodEnd: closing date of the billing period (YYYY-MM-DD) or null.
- dueDate: last day to pay (YYYY-MM-DD) or null.
- totalDue: total amount to pay of this statement, or null. minimumDue: minimum payment, or null.
- currency: "PEN" or "USD" of the totals.
- movements: every purchase or charge of the period, one per line of the statement: date (YYYY-MM-DD, the processing
  date when there are two), description as printed, amount (positive number), currency, installment "n/m" when the line
  is an installment of a purchase, otherwise null.
Leave out payments to the card, refunds and credits, previous balance, interest summaries and totals.
Do not invent movements: if the text has none, return an empty list.`

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()

export const statementAiSchema = z.object({
  cardName: z.string().nullable(),
  periodEnd: day,
  dueDate: day,
  totalDue: z.number().nullable(),
  minimumDue: z.number().nullable(),
  currency: z.enum(Currency),
  movements: z.array(
    z.object({
      date: day,
      description: z.string().min(1),
      amount: z.number().positive(),
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
  return {
    cardHint,
    periodEnd: output.periodEnd,
    dueDate: output.dueDate,
    totalDue: output.totalDue,
    minimumDue: output.minimumDue,
    currency: output.currency,
    rows: output.movements.map((movement) => ({ ...movement })),
  }
}
