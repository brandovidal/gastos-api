import { TelegramUpdate } from '@/providers/telegram/telegram.types'

// Updates with the shape the Bot API really sends (https://core.telegram.org/bots/api#update), ids anonymized.
// Used by the mapper tests (P9) and by the image (P4) and audio (P5) flows.
const chat = { id: 555, type: 'private', first_name: 'Brando' }
const from = { id: 555, is_bot: false, first_name: 'Brando', language_code: 'es' }
const date = 1790000000

const photoSizes = (uniqueId: string) => [
  {
    file_id: `AgACAgEAAxkBAAI-${uniqueId}-s`,
    file_unique_id: `${uniqueId}-s`,
    width: 90,
    height: 67,
    file_size: 1_243,
  },
  {
    file_id: `AgACAgEAAxkBAAI-${uniqueId}-m`,
    file_unique_id: `${uniqueId}-m`,
    width: 320,
    height: 240,
    file_size: 18_775,
  },
  {
    file_id: `AgACAgEAAxkBAAI-${uniqueId}-x`,
    file_unique_id: `${uniqueId}-x`,
    width: 1280,
    height: 960,
    file_size: 154_020,
  },
]

export const TELEGRAM_UPDATES = {
  text: { update_id: 1, message: { message_id: 10, from, chat, date, text: 'almuerzo 25 soles con yape' } },
  command: {
    update_id: 2,
    message: {
      message_id: 11,
      from,
      chat,
      date,
      text: '/resumen',
      entities: [{ offset: 0, length: 8, type: 'bot_command' }],
    },
  },
  button: {
    update_id: 3,
    callback_query: {
      id: '4382bfdwdsb323b2d9',
      from,
      chat_instance: '-8793648235123',
      data: 'ok:cm1draft0000000000000001',
      message: { message_id: 20, from: { id: 999, is_bot: true, first_name: 'Kogane' }, chat, date, text: 'resumen' },
    },
  },
  photo: { update_id: 4, message: { message_id: 12, from, chat, date, photo: photoSizes('AQADyape') } },
  photoWithCaption: {
    update_id: 5,
    message: { message_id: 13, from, chat, date, photo: photoSizes('AQADvoucher'), caption: 'persona dany' },
  },
  album: [
    {
      update_id: 6,
      message: { message_id: 14, from, chat, date, media_group_id: '13572468', photo: photoSizes('AQADalbum1') },
    },
    {
      update_id: 7,
      message: { message_id: 15, from, chat, date, media_group_id: '13572468', photo: photoSizes('AQADalbum2') },
    },
  ],
  imageAsDocument: {
    update_id: 8,
    message: {
      message_id: 16,
      from,
      chat,
      date,
      document: {
        file_id: 'BQACAgEAAxkBAAI-doc',
        file_unique_id: 'AgADdoc',
        file_name: 'voucher.jpg',
        mime_type: 'image/jpeg',
        file_size: 402_112,
      },
    },
  },
  voice: {
    update_id: 9,
    message: {
      message_id: 17,
      from,
      chat,
      date,
      voice: {
        file_id: 'AwACAgEAAxkBAAI-voice',
        file_unique_id: 'AgADvoice',
        duration: 6,
        mime_type: 'audio/ogg',
        file_size: 21_504,
      },
    },
  },
  editedMessage: {
    update_id: 10,
    edited_message: { message_id: 10, from, chat, date, edit_date: date + 30, text: 'almuerzo 30 soles con yape' },
  },
  sticker: {
    update_id: 11,
    message: { message_id: 18, from, chat, date, sticker: { file_id: 'CAACAgEAAxkBAAI-st', file_unique_id: 'AgADst' } },
  },
  group: {
    update_id: 12,
    message: {
      message_id: 19,
      from,
      chat: { id: -100123456, type: 'supergroup', title: 'Familia' },
      date,
      text: '/resumen@kogane_finanzas_bot',
    },
  },
} satisfies Record<string, TelegramUpdate | TelegramUpdate[]>
