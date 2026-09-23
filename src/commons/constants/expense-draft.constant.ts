export enum ExpenseDraftChannel {
  TELEGRAM = 'telegram',
  WHATSAPP = 'whatsapp',
}

export enum ExpenseDraftInputType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
}

export enum ExpenseDraftDocumentType {
  YAPE_RECEIPT = 'yape_receipt',
  PLIN_RECEIPT = 'plin_receipt',
  VOUCHER = 'voucher',
  INVOICE = 'invoice',
  BANK_STATEMENT = 'bank_statement',
  BANKING_SCREENSHOT = 'banking_screenshot',
}

export enum ExpenseDraftStatus {
  DRAFT = 'draft',
  AWAITING_CONFIRMATION = 'awaiting_confirmation',
  SAVED = 'saved',
  INBOX = 'inbox',
  DISCARDED = 'discarded',
  FAILED = 'failed',
}

// Statuses of the expense draft the bot is still talking about with the user
export const OPEN_EXPENSE_DRAFT_STATUSES = [ExpenseDraftStatus.DRAFT, ExpenseDraftStatus.AWAITING_CONFIRMATION]

// An open expense draft without updates after this time is discarded (final value in P3)
export const EXPENSE_DRAFT_EXPIRATION_MINUTES = 30
