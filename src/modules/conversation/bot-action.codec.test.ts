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

  it.each([
    [BotAction.COMMAND, 'borrador'], // help buttons: the command
    [BotAction.INSTALLMENTS_OK, FILE_ID], // D66
    [BotAction.INSTALLMENTS_EDIT, FILE_ID],
    [BotAction.REPORT, `pdf-${FILE_ID}`], // D39: format and person
    [BotAction.EDIT_SAVED, FILE_ID], // D76
  ])('should round-trip the "%s" button', (name, draftId) => {
    const data = encodeBotAction({ name, draftId })

    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
    expect(decodeBotAction(data)).toEqual({ name, draftId })
  })

  it('should round-trip a button of the split message with the person index and the choice (D75)', () => {
    const payload = { name: BotAction.SHARE, draftId: FILE_ID, field: '1', value: 'p20' }
    const data = encodeBotAction(payload)

    expect(data).toBe(`shr:${FILE_ID}:1:p20`)
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
    expect(decodeBotAction(data)).toEqual(payload)
    expect(decodeBotAction(`shr:${FILE_ID}`)).toBeNull()
  })

  it('should round-trip the buttons of a reminder and of /avisos (P20)', () => {
    const payload = { name: BotAction.NOTIFY, draftId: FILE_ID, value: 'p' }
    const data = encodeBotAction(payload)

    expect(data).toBe(`ntf:${FILE_ID}:p`)
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
    expect(decodeBotAction(data)).toEqual(payload)
    expect(decodeBotAction(`ntf:${FILE_ID}`)).toBeNull()
    expect(decodeBotAction(encodeBotAction({ name: BotAction.NOTIFY_SETTING, draftId: 'daily_close' }))).toEqual({
      name: BotAction.NOTIFY_SETTING,
      draftId: 'daily_close',
    })
  })

  it.each(['', 'unknown:id', 'ok', `set:${FILE_ID}`, `set:${FILE_ID}:zz:value`, 'payp:batch'])(
    'should reject "%s"',
    (data) => {
      expect(decodeBotAction(data)).toBeNull()
    },
  )
})
