import { PaymentStatus } from './expense.constant'

// Reminders and alerts (P20, D86): one Notification row per notice, delivered to Telegram and the web bell
export enum NotificationKind {
  DUE = 'due', // something is due tomorrow: a card payment, a fixed cost, a subscription, a debt installment
  CARD_CLOSE = 'card_close', // a card closes its statement tomorrow
  DAILY_CLOSE = 'daily_close', // 21:00: what was spent today and what is still due today
  WEEKLY = 'weekly', // Sunday 20:00: the week, the budget left and the debts
  BUDGET = 'budget', // a category reached its alert threshold (80 %) or its limit
  ANOMALY = 'anomaly', // a platform got more expensive, a duplicated charge, a platform not charged
  RECURRING = 'recurring', // the expenses of the month were created from Recurrentes
  STATEMENT = 'statement', // a bank statement was read and reconciled (P14, D95)
}

// What a notification is about: what ✅ Pagado acts on and where the web link goes
export enum NotificationRefType {
  FIXED_COST = 'fixed_cost',
  SUBSCRIPTION = 'subscription',
  CARD_STATEMENT = 'card_statement', // refId "<paymentMethodId>@<yyyy>-<mm>": the statement of that card and month
  CREDIT_CARD_EXPENSE = 'credit_card_expense',
  DAILY_EXPENSE = 'daily_expense',
  DEBT = 'debt',
  CATEGORY = 'category',
  STATEMENT = 'statement',
}

// A kind without a row in ntf_settings: everything on, except the daily close in Telegram (only the web bell)
export const DEFAULT_NOTIFICATION_SETTINGS: Record<NotificationKind, { telegram: boolean; web: boolean }> = {
  [NotificationKind.DUE]: { telegram: true, web: true },
  [NotificationKind.CARD_CLOSE]: { telegram: true, web: true },
  [NotificationKind.DAILY_CLOSE]: { telegram: false, web: true },
  [NotificationKind.WEEKLY]: { telegram: true, web: true },
  [NotificationKind.BUDGET]: { telegram: true, web: true },
  [NotificationKind.ANOMALY]: { telegram: true, web: true },
  [NotificationKind.RECURRING]: { telegram: true, web: true },
  [NotificationKind.STATEMENT]: { telegram: true, web: true },
}

// Scheduled jobs (D87): BullMQ job schedulers in America/Lima
export enum NotificationJob {
  RECURRING = 'recurring',
  DUE_REMINDERS = 'due-reminders',
  DAILY_CLOSE = 'daily-close',
  WEEKLY = 'weekly',
  UPCOMING_REFRESH = 'upcoming-refresh',
  FILES_CLEANUP = 'files-cleanup',
}

export const NOTIFICATION_JOB_PATTERNS: Record<NotificationJob, string> = {
  [NotificationJob.RECURRING]: '0 6 1 * *',
  [NotificationJob.DUE_REMINDERS]: '0 9 * * *',
  [NotificationJob.DAILY_CLOSE]: '0 21 * * *',
  [NotificationJob.WEEKLY]: '0 20 * * 0',
  [NotificationJob.UPCOMING_REFRESH]: '5 * * * *',
  [NotificationJob.FILES_CLEANUP]: '30 */6 * * *',
}

export const SCHEDULE_QUEUE = 'ntf-schedule'
export const DELIVER_QUEUE = 'ntf-deliver'

// Telegram delivery: 5 attempts, 1, 2, 4, 8 minutes apart
export const DELIVER_ATTEMPTS = 5
export const DELIVER_BACKOFF_MS = 60_000

// After a change (an expense saved, a debt paid…) the list of upcoming reminders is rebuilt once, 30 s later
export const UPCOMING_REFRESH_DELAY_MS = 30_000

// Redis keys (D87). Turso is the source of truth: these are rebuilt from it when missing
export const REDIS_KEYS = {
  upcoming: 'ntf:upcoming', // sorted set, score = epoch ms of the day, value = JSON CalendarEvent
  recent: 'ntf:recent', // list of JSON notifications, newest first
  unread: 'ntf:unread', // counter for the bell
  awaitingAmount: (chatId: string) => `ntf:await:${chatId}`, // ✏️ Editar monto: the notification waiting for it
} as const

export const UPCOMING_DAYS = 45
export const RECENT_NOTIFICATIONS = 50
export const AWAITING_AMOUNT_TTL_SECONDS = 10 * 60

// Payment statuses that still have to be paid (calendar, reminders, ✅ Pagado)
export const UNPAID_STATUSES: string[] = [
  PaymentStatus.NOT_STARTED,
  PaymentStatus.PENDING,
  PaymentStatus.PARTIALLY_PAID,
]

// Cargos raros (D86)
export const ANOMALY_LOOKBACK_DAYS = 2 // only expenses registered in the last 2 days are checked (no flood of old ones)
export const DUPLICATE_WINDOW_HOURS = 48
export const NOT_CHARGED_GRACE_DAYS = 3
export const PRICE_CHANGE_MIN = 0.5 // soles: rounding differences are not a price change

// ✅ Pagado · ✏️ Editar monto · 🔕 Silenciar in "ntf:<notificationId>:<op>"
export enum NotificationOp {
  PAID = 'p',
  EDIT_AMOUNT = 'e',
  MUTE = 'm',
}
