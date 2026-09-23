export enum ChannelMessageType {
  TEXT = 'text',
  COMMAND = 'command',
  ACTION = 'action',
}

// Inline button actions. Values travel inside Telegram callback_data (max 64 bytes).
export enum BotAction {
  SAVE = 'ok',
  EDIT = 'edit',
  INBOX = 'inbox',
  DISCARD = 'no',
  SET_FIELD = 'set',
  RESUME = 're', // /bandeja: reopen an inbox or failed expense
  NEW_PAYMENT_METHOD = 'new', // create the payment method the user typed
}

export enum BotCommand {
  START = 'start',
  HELP = 'ayuda',
  CANCEL = 'cancelar',
  RECENT = 'ultimos',
  SUMMARY = 'resumen',
  INBOX = 'bandeja',
  USAGE = 'uso',
}

// Descriptions shown in the Telegram command menu (Spanish: user-facing)
export const BOT_COMMAND_DESCRIPTIONS: Record<BotCommand, string> = {
  [BotCommand.START]: 'Empezar y ver ejemplos',
  [BotCommand.HELP]: 'Cómo registrar gastos',
  [BotCommand.CANCEL]: 'Descartar el borrador abierto',
  [BotCommand.RECENT]: 'Últimos gastos guardados',
  [BotCommand.SUMMARY]: 'Total del mes',
  [BotCommand.INBOX]: 'Gastos en bandeja y los que fallaron',
  [BotCommand.USAGE]: 'Uso de la AI hoy',
}

export const CALLBACK_SEPARATOR = ':'

// pendingField value after ✏️ Corregir: the next message goes to the AI with the draft
export const FREE_CORRECTION_FIELD = 'free_correction'

// pendingField value while the bot asks the closing and due days of a new credit card: "card_days:<paymentMethodId>"
export const CARD_DAYS_FIELD_PREFIX = 'card_days:'

// Payment method names typed by the user travel in callback_data: keep them short (64 bytes in total)
export const MAX_NEW_PAYMENT_METHOD_NAME_BYTES = 20

// Short codes for the field in "set" callbacks
export const FIELD_CODES = {
  destination: 'd',
  period: 'pe',
  paymentMethodId: 'pm',
  categoryId: 'cat',
  personId: 'p',
} as const

export const MAX_QUICK_REPLIES = 10
export const QUICK_REPLIES_PER_ROW = 2
export const RECENT_EXPENSES_LIMIT = 5
export const INBOX_LIMIT = 5
