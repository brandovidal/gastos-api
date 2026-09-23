// Subset of the Telegram Bot API Update used by the bot (https://core.telegram.org/bots/api#update)
export interface TelegramChat {
  id: number
  type: string
}

export interface TelegramMessage {
  message_id: number
  chat: TelegramChat
  date: number
  text?: string
  caption?: string
}

export interface TelegramCallbackQuery {
  id: string
  data?: string
  message?: TelegramMessage
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface TelegramInlineKeyboardButton {
  text: string
  callback_data: string
}

export interface TelegramReplyMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][]
}

// https://core.telegram.org/bots/api#webhookinfo (subset)
export interface TelegramWebhookInfo {
  url: string
  pending_update_count: number
  last_error_date?: number
  last_error_message?: string
}
