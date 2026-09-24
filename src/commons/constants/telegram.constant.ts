export const TELEGRAM_API_URL = 'https://api.telegram.org'

export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token'

export const TELEGRAM_PARSE_MODE = 'HTML'

export const TELEGRAM_ALLOWED_UPDATES = ['message', 'callback_query']

// Outgoing Bot API calls: timeout, and retries on 429 (waiting retry_after), 5xx and network errors
export const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000
export const TELEGRAM_MAX_RETRIES = 2
export const TELEGRAM_RETRY_DELAY_MS = 1_000
// A longer flood wait is not worth blocking the chat queue: fail and let the user retry
export const TELEGRAM_MAX_RETRY_AFTER_SECONDS = 30

// The photos of an album arrive as separate updates within a second: wait this long after the last one (P21)
export const ALBUM_WAIT_MS = 1_500

// Shutdown waits this long for the chat queues (Railway sends SIGTERM on each deploy)
export const SHUTDOWN_DRAIN_TIMEOUT_MS = 10_000
// On startup, drafts without extraction older than this were interrupted by the restart (newer ones may still
// belong to the previous instance while both run during a deploy)
export const INTERRUPTED_DRAFT_MIN_AGE_MS = 2 * 60_000

// /v1/health: state of the Telegram webhook (getWebhookInfo)
export enum WebhookStatus {
  OK = 'OK',
  NOT_SET = 'NOT_SET',
  ERROR = 'ERROR',
  UNAVAILABLE = 'UNAVAILABLE',
  NOT_CONFIGURED = 'NOT_CONFIGURED',
}
// A delivery error older than this no longer marks the webhook as ERROR
export const WEBHOOK_RECENT_ERROR_MS = 60 * 60_000

// Files are downloaded from https://api.telegram.org/file/bot<token>/<file_path> (getFile allows up to 20 MB)
export const TELEGRAM_FILE_URL = 'https://api.telegram.org/file'
export const TELEGRAM_DOWNLOAD_TIMEOUT_MS = 20_000
