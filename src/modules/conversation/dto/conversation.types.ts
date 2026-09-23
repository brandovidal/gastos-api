import { BotAction, ChannelMessageType } from '@/commons/constants/conversation.constant'
import { ExpenseDraftChannel } from '@/commons/constants/expense-draft.constant'

export interface BotActionPayload {
  name: BotAction
  draftId: string
  field?: string // SET_FIELD: ExpenseField
  value?: string // SET_FIELD: enum value or catalog id
}

// A message from any channel, already translated by its adapter (Telegram now, WhatsApp later)
export interface ChannelMessage {
  channel: ExpenseDraftChannel
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
