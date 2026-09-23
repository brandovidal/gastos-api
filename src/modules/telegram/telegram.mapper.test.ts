import { BotAction, ChannelMessageType } from '@/commons/constants/conversation.constant'
import { ExpenseDraftChannel } from '@/commons/constants/expense-draft.constant'
import { FILE_ID } from '@/modules/conversation/mocks/conversation.mock'

import { mapTelegramUpdate, toReplyMarkup } from './telegram.mapper'

const chat = { id: 555, type: 'private' }

describe('telegram mapper', () => {
  it('should map a text message', () => {
    expect(
      mapTelegramUpdate({ update_id: 1, message: { message_id: 10, chat, date: 0, text: 'almuerzo 25' } }),
    ).toEqual({
      message: {
        channel: ExpenseDraftChannel.TELEGRAM,
        chatId: '555',
        messageId: '10',
        type: ChannelMessageType.TEXT,
        text: 'almuerzo 25',
      },
    })
  })

  it('should map commands, including the bot mention used in groups', () => {
    const mapped = mapTelegramUpdate({
      update_id: 1,
      message: { message_id: 10, chat, date: 0, text: '/Resumen@gastos_bot' },
    })

    expect(mapped?.message).toMatchObject({ type: ChannelMessageType.COMMAND, command: 'resumen' })
  })

  it('should map a pressed button with its callback id and source message', () => {
    const mapped = mapTelegramUpdate({
      update_id: 2,
      callback_query: { id: 'cb-1', data: `ok:${FILE_ID}`, message: { message_id: 20, chat, date: 0 } },
    })

    expect(mapped).toEqual({
      message: {
        channel: ExpenseDraftChannel.TELEGRAM,
        chatId: '555',
        messageId: 'callback:cb-1',
        type: ChannelMessageType.ACTION,
        action: { name: BotAction.SAVE, draftId: FILE_ID },
      },
      callbackQueryId: 'cb-1',
      sourceMessageId: 20,
    })
  })

  it('should use the caption of a photo as text', () => {
    const mapped = mapTelegramUpdate({ update_id: 1, message: { message_id: 10, chat, date: 0, caption: 'taxi 15' } })

    expect(mapped?.message.text).toBe('taxi 15')
  })

  it.each([
    ['an update without message', { update_id: 1 }],
    ['a photo without caption', { update_id: 1, message: { message_id: 10, chat, date: 0 } }],
    [
      'unknown button data',
      { update_id: 1, callback_query: { id: 'cb', data: 'x', message: { message_id: 1, chat, date: 0 } } },
    ],
  ])('should ignore %s', (_case, update) => {
    expect(mapTelegramUpdate(update)).toBeNull()
  })

  it('should build the inline keyboard', () => {
    expect(toReplyMarkup([[{ label: '✅ Guardar', data: 'ok:1' }]])).toEqual({
      inline_keyboard: [[{ text: '✅ Guardar', callback_data: 'ok:1' }]],
    })
    expect(toReplyMarkup([])).toBeUndefined()
  })
})
