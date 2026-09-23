import { ChannelMessageType } from '@/commons/constants/conversation.constant'
import { ExpenseFileChannel } from '@/commons/constants/expense-file.constant'
import { decodeBotAction } from '@/modules/conversation/bot-action.codec'
import { BotButton, ChannelMessage } from '@/modules/conversation/dto/conversation.types'

import { TelegramReplyMarkup, TelegramUpdate } from '@/providers/telegram/telegram.types'

export interface MappedTelegramUpdate {
  message: ChannelMessage
  callbackQueryId?: string // must be answered right away
  sourceMessageId?: number // message with the pressed button, edited by "edit" replies
}

// "/resumen@my_bot extra" -> "resumen"
const parseCommand = (text: string) => text.slice(1).split(/\s+/)[0].split('@')[0].toLowerCase()

export function mapTelegramUpdate({
  message,
  callback_query: callbackQuery,
}: TelegramUpdate): MappedTelegramUpdate | null {
  if (callbackQuery?.message && callbackQuery.data) {
    const action = decodeBotAction(callbackQuery.data)
    if (!action) return null

    return {
      message: {
        channel: ExpenseFileChannel.TELEGRAM,
        chatId: String(callbackQuery.message.chat.id),
        messageId: `callback:${callbackQuery.id}`,
        type: ChannelMessageType.ACTION,
        action,
      },
      callbackQueryId: callbackQuery.id,
      sourceMessageId: callbackQuery.message.message_id,
    }
  }

  const text = message?.text ?? message?.caption
  if (!message || !text) return null // photos without caption and voice notes arrive in P4 / P5

  const isCommand = text.startsWith('/')

  return {
    message: {
      channel: ExpenseFileChannel.TELEGRAM,
      chatId: String(message.chat.id),
      messageId: String(message.message_id),
      type: isCommand ? ChannelMessageType.COMMAND : ChannelMessageType.TEXT,
      ...(isCommand ? { command: parseCommand(text) } : { text }),
    },
  }
}

export function toReplyMarkup(buttons?: BotButton[][]): TelegramReplyMarkup | undefined {
  if (!buttons?.length) return undefined

  return {
    inline_keyboard: buttons.map((row) => row.map(({ label, data }) => ({ text: label, callback_data: data }))),
  }
}
