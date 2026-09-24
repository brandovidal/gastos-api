import { BotAction } from '@/commons/constants/conversation.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'

import { decodeBotAction, encodeBotAction } from './bot-action.codec'
import { FILE_ID } from './mocks/conversation.mock'

describe('bot action codec', () => {
  it('should round-trip simple actions', () => {
    const data = encodeBotAction({ name: BotAction.SAVE, draftId: FILE_ID })

    expect(data).toBe(`ok:${FILE_ID}`)
    expect(decodeBotAction(data)).toEqual({ name: BotAction.SAVE, draftId: FILE_ID })
  })

  it('should round-trip field values with a short field code and stay under 64 bytes', () => {
    const payload = {
      name: BotAction.SET_FIELD,
      draftId: FILE_ID,
      field: ExpenseField.PAYMENT_METHOD,
      value: 'ckpaymentmethod00000000001',
    }
    const data = encodeBotAction(payload)

    expect(data).toBe(`set:${FILE_ID}:pm:ckpaymentmethod00000000001`)
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
    expect(decodeBotAction(data)).toEqual(payload)
  })

  it('should round-trip the installment picked for a debt payment under 64 bytes', () => {
    const payload = { name: BotAction.PAY_PICK, draftId: 'a1b2c3d4e5f6a7b8c9d0', value: 'ckdebt0000000000000000001' }
    const data = encodeBotAction(payload)

    expect(data).toBe('payp:a1b2c3d4e5f6a7b8c9d0:ckdebt0000000000000000001')
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
    expect(decodeBotAction(data)).toEqual(payload)
    expect(decodeBotAction('pay:a1b2c3d4e5f6a7b8c9d0')).toEqual({
      name: BotAction.PAY_CONFIRM,
      draftId: 'a1b2c3d4e5f6a7b8c9d0',
    })
  })

  it.each([BotAction.SAVE_ALL, BotAction.REVIEW_ALL, BotAction.LATER_ALL])(
    'should round-trip the "%s" button of a list of screenshots with its batch uuid',
    (name) => {
      const payload = { name, draftId: '0b6f5a1e-7c4d-4f7e-9a51-3d2f0c8e1b27' }
      const data = encodeBotAction(payload)

      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
      expect(decodeBotAction(data)).toEqual(payload)
    },
  )

  it.each(['', 'unknown:id', 'ok', `set:${FILE_ID}`, `set:${FILE_ID}:zz:value`, 'payp:batch'])(
    'should reject "%s"',
    (data) => {
      expect(decodeBotAction(data)).toBeNull()
    },
  )
})
