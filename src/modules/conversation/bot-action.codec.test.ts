import { BotAction } from '@/commons/constants/conversation.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'

import { decodeBotAction, encodeBotAction } from './bot-action.codec'
import { FILE_ID } from './mocks/conversation.mock'

describe('bot action codec', () => {
  it('should round-trip simple actions', () => {
    const data = encodeBotAction({ name: BotAction.SAVE, expenseFileId: FILE_ID })

    expect(data).toBe(`ok:${FILE_ID}`)
    expect(decodeBotAction(data)).toEqual({ name: BotAction.SAVE, expenseFileId: FILE_ID })
  })

  it('should round-trip field values with a short field code and stay under 64 bytes', () => {
    const payload = {
      name: BotAction.SET_FIELD,
      expenseFileId: FILE_ID,
      field: ExpenseField.PAYMENT_METHOD,
      value: 'ckpaymentmethod00000000001',
    }
    const data = encodeBotAction(payload)

    expect(data).toBe(`set:${FILE_ID}:pm:ckpaymentmethod00000000001`)
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
    expect(decodeBotAction(data)).toEqual(payload)
  })

  it.each(['', 'unknown:id', 'ok', `set:${FILE_ID}`, `set:${FILE_ID}:zz:value`])('should reject "%s"', (data) => {
    expect(decodeBotAction(data)).toBeNull()
  })
})
