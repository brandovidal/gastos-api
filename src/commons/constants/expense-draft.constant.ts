export enum ExpenseDraftChannel {
  TELEGRAM = 'telegram',
  WEB = 'web', // kogane-app: Mensajes and Nuevo gasto (D57)
  WHATSAPP = 'whatsapp',
}

export enum ExpenseDraftInputType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  MANUAL = 'manual', // filled in the web form (Nuevo gasto)
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
  PENDING_REVIEW = 'pending_review', // Borrador (D50): kept for later from the chat, or expired without confirming
  DISCARDED = 'discarded',
  FAILED = 'failed',
}

// Statuses of the expense draft the bot is still talking about with the user
export const OPEN_EXPENSE_DRAFT_STATUSES = [ExpenseDraftStatus.DRAFT, ExpenseDraftStatus.AWAITING_CONFIRMATION]

// Borrador (D50): everything still pending review, listed by /borrador and GET /v1/drafts
export const REVIEW_EXPENSE_DRAFT_STATUSES = [
  ...OPEN_EXPENSE_DRAFT_STATUSES,
  ExpenseDraftStatus.PENDING_REVIEW,
  ExpenseDraftStatus.FAILED,
]

// An open expense draft without updates after this time is discarded (final value in P3)
export const EXPENSE_DRAFT_EXPIRATION_MINUTES = 30

// kogane-app is used by one person: every web message and form belongs to the same chat
export const WEB_CHAT_ID = 'web'
