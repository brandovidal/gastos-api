import { BotAction, ChannelMessageType } from '@/commons/constants/conversation.constant'
import { ExpenseFileChannel } from '@/commons/constants/expense-file.constant'

export interface BotActionPayload {
  name: BotAction
  expenseFileId: string
  field?: string // SET_FIELD: ExpenseField
  value?: string // SET_FIELD: enum value or catalog id
}

// A message from any channel, already translated by its adapter (Telegram now, WhatsApp later)
export interface ChannelMessage {
  channel: ExpenseFileChannel
  chatId: string
  messageId: string
  type: ChannelMessageType
  text?: string
  command?: string
  action?: BotActionPayload
}

export interface BotButton {
  label: string
  data: string // encoded BotActionPayload (see bot-action.codec.ts)
}

export interface BotReply {
  text: string // HTML: <b>, <i> and escaped user text
  buttons?: BotButton[][]
  edit?: boolean // replace the message that had the pressed button instead of sending a new one
}

export interface ConversationResult {
  replies: BotReply[]
  notice?: string // short toast for the pressed button
}
