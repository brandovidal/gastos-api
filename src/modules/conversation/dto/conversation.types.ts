import { BotAction, ChannelMessageType } from '@/commons/constants/conversation.constant'
import { ExpenseDraftChannel } from '@/commons/constants/expense-draft.constant'

export interface BotActionPayload {
  name: BotAction
  draftId: string
  field?: string // SET_FIELD: ExpenseField
  value?: string // SET_FIELD: enum value or catalog id
}

// A file received in a channel; the bytes are downloaded later through the channel MediaDownloader
export interface ChannelMedia {
  fileId: string // id to download it (Telegram file_id)
  uniqueId: string // stable id of the file: the same image sent twice has the same one
  sizeBytes?: number
  durationSeconds?: number // audio
}

// A message from any channel, already translated by its adapter (Telegram now, WhatsApp later)
export interface ChannelMessage {
  channel: ExpenseDraftChannel
  chatId: string
  messageId: string
  type: ChannelMessageType
  text?: string // message text, or the caption of an image
  media?: ChannelMedia
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
