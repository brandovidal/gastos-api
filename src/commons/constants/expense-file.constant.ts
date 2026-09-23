export enum ExpenseFileChannel {
  TELEGRAM = 'telegram',
  WHATSAPP = 'whatsapp',
}

export enum ExpenseFileInputType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
}

export enum ExpenseFileDocumentType {
  YAPE_RECEIPT = 'yape_receipt',
  PLIN_RECEIPT = 'plin_receipt',
  VOUCHER = 'voucher',
  INVOICE = 'invoice',
  BANK_STATEMENT = 'bank_statement',
  BANKING_SCREENSHOT = 'banking_screenshot',
}

export enum ExpenseFileStatus {
  DRAFT = 'draft',
  AWAITING_CONFIRMATION = 'awaiting_confirmation',
  SAVED = 'saved',
  INBOX = 'inbox',
  DISCARDED = 'discarded',
  FAILED = 'failed',
}

// Statuses of the expense file the bot is still talking about with the user
export const OPEN_EXPENSE_FILE_STATUSES = [ExpenseFileStatus.DRAFT, ExpenseFileStatus.AWAITING_CONFIRMATION]

// An open expense file without updates after this time is discarded (final value in P3)
export const EXPENSE_FILE_EXPIRATION_MINUTES = 30
