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
}

export enum BotCommand {
  START = 'start',
  HELP = 'ayuda',
  CANCEL = 'cancelar',
  RECENT = 'ultimos',
  SUMMARY = 'resumen',
}

// Descriptions shown in the Telegram command menu (Spanish: user-facing)
export const BOT_COMMAND_DESCRIPTIONS: Record<BotCommand, string> = {
  [BotCommand.START]: 'Empezar y ver ejemplos',
  [BotCommand.HELP]: 'Cómo registrar gastos',
  [BotCommand.CANCEL]: 'Descartar el borrador abierto',
  [BotCommand.RECENT]: 'Últimos gastos guardados',
  [BotCommand.SUMMARY]: 'Total del mes',
}

export const CALLBACK_SEPARATOR = ':'

// pendingField value after ✏️ Corregir: the next message goes to the AI with the draft
export const FREE_CORRECTION_FIELD = 'free_correction'

// Short codes for the field in "set" callbacks
export const FIELD_CODES = {
  destination: 'd',
  period: 'pe',
  paymentMethodId: 'pm',
  creditCardId: 'cc',
  categoryId: 'cat',
  personId: 'p',
} as const

export const MAX_QUICK_REPLIES = 8
export const QUICK_REPLIES_PER_ROW = 2
export const RECENT_EXPENSES_LIMIT = 5
