import { BotAction, CALLBACK_SEPARATOR, FIELD_CODES } from '@/commons/constants/conversation.constant'

import { BotActionPayload } from './dto/conversation.types'

const ACTIONS = Object.values(BotAction) as string[]
const FIELD_BY_CODE = Object.fromEntries(Object.entries(FIELD_CODES).map(([field, code]) => [code, field]))

// "<action>:<draftId>[:<fieldCode>:<value>]". A cuid is 25 chars, so it stays under Telegram's 64 bytes.
// Debt payments use the batch id as draftId and "payp:<batchId>:<debtId>" (20 + 25 chars).
export function encodeBotAction({ name, draftId, field, value }: BotActionPayload): string {
  const parts: string[] = [name, draftId]

  if (field && value) {
    parts.push(FIELD_CODES[field as keyof typeof FIELD_CODES] ?? field, value)
  } else if (name === BotAction.PAY_PICK && value) {
    parts.push(value)
  }

  return parts.join(CALLBACK_SEPARATOR)
}

export function decodeBotAction(data: string): BotActionPayload | null {
  const [name, draftId, fieldCode, value] = data.split(CALLBACK_SEPARATOR)

  if (!ACTIONS.includes(name) || !draftId) return null

  if (name === BotAction.SET_FIELD) {
    const field = FIELD_BY_CODE[fieldCode]
    return field && value ? { name, draftId, field, value } : null
  }

  // "new:<id>:<paymentMethodType>:<typed name>" creates it; "new:<id>" means "no"
  if (name === BotAction.NEW_PAYMENT_METHOD) {
    return fieldCode && value
      ? { name, draftId, field: fieldCode, value }
      : { name: BotAction.NEW_PAYMENT_METHOD, draftId }
  }

  // "shr:<draftId>:<person index>:<choice>": a button of the split message (D75)
  if (name === BotAction.SHARE) {
    return fieldCode && value ? { name, draftId, field: fieldCode, value } : null
  }

  // "payp:<batchId>:<debtId>": the installment picked for a debt payment
  if (name === BotAction.PAY_PICK) {
    return fieldCode ? { name, draftId, value: fieldCode } : null
  }

  return { name: name as BotAction, draftId }
}
