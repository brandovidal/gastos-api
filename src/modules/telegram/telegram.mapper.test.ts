import { BotAction, ChannelMessageType } from '@/commons/constants/conversation.constant'
import { ExpenseDraftChannel } from '@/commons/constants/expense-draft.constant'
import { FILE_ID } from '@/modules/conversation/mocks/conversation.mock'

import { TELEGRAM_UPDATES } from './mocks/telegram-updates.mock'
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

  it('should map a photo to an image with its largest size and the caption as text', () => {
    expect(mapTelegramUpdate(TELEGRAM_UPDATES.photoWithCaption)?.message).toEqual({
      channel: ExpenseDraftChannel.TELEGRAM,
      chatId: '555',
      messageId: '13',
      type: ChannelMessageType.IMAGE,
      media: { fileId: 'AgACAgEAAxkBAAI-AQADvoucher-x', uniqueId: 'AQADvoucher-x', sizeBytes: 154_020 },
      text: 'persona dany',
    })
    expect(mapTelegramUpdate(TELEGRAM_UPDATES.photo)?.message).not.toHaveProperty('text')
  })

  it('should map a voice note to an audio message with its duration', () => {
    expect(mapTelegramUpdate(TELEGRAM_UPDATES.voice)?.message).toEqual({
      channel: ExpenseDraftChannel.TELEGRAM,
      chatId: '555',
      messageId: '17',
      type: ChannelMessageType.AUDIO,
      media: { fileId: 'AwACAgEAAxkBAAI-voice', uniqueId: 'AgADvoice', sizeBytes: 21_504, durationSeconds: 6 },
    })
  })

  it('should map an image sent as a file, and each photo of an album on its own', () => {
    expect(mapTelegramUpdate(TELEGRAM_UPDATES.imageAsDocument)?.message).toMatchObject({
      type: ChannelMessageType.IMAGE,
      media: { fileId: 'BQACAgEAAxkBAAI-doc', uniqueId: 'AgADdoc', sizeBytes: 402_112 },
    })
    expect(TELEGRAM_UPDATES.album.map((update) => mapTelegramUpdate(update)?.message.media?.uniqueId)).toEqual([
      'AQADalbum1-x',
      'AQADalbum2-x',
    ])
  })

  it.each([
    ['an update without message', { update_id: 1 }],
    ['a message without text or media', { update_id: 1, message: { message_id: 10, chat, date: 0 } }],
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

  // Real update shapes (P9); images and voice notes are mapped in P4 / P5
  describe('real updates', () => {
    it('should map the text, command and button updates', () => {
      expect(mapTelegramUpdate(TELEGRAM_UPDATES.text)?.message).toMatchObject({
        type: 'text',
        text: 'almuerzo 25 soles con yape',
      })
      expect(mapTelegramUpdate(TELEGRAM_UPDATES.command)?.message).toMatchObject({
        type: 'command',
        command: 'resumen',
      })
      expect(mapTelegramUpdate(TELEGRAM_UPDATES.button)).toMatchObject({
        callbackQueryId: '4382bfdwdsb323b2d9',
        sourceMessageId: 20,
      })
    })

    it('should ignore edited messages and stickers', () => {
      expect(mapTelegramUpdate(TELEGRAM_UPDATES.editedMessage)).toBeNull()
      expect(mapTelegramUpdate(TELEGRAM_UPDATES.sticker)).toBeNull()
    })

    it('should read the command of a group message addressed to the bot', () => {
      expect(mapTelegramUpdate(TELEGRAM_UPDATES.group)?.message).toMatchObject({
        chatId: '-100123456',
        command: 'resumen',
      })
    })
  })
})
