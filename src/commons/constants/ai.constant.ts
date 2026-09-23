export enum AiProvider {
  GEMINI = 'gemini',
  GROQ = 'groq',
}

export enum AiOperation {
  EXTRACT = 'extract',
  TRANSCRIBE = 'transcribe',
}

export enum AiInputPartType {
  TEXT = 'text',
  IMAGE = 'image',
}

export enum AiErrorCode {
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  INVALID_OUTPUT = 'INVALID_OUTPUT',
}

// Model names change often: override them with env vars (see .env.example)
export const DEFAULT_GEMINI_MODEL_LITE = 'gemini-3.5-flash-lite'
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash'
export const DEFAULT_GROQ_MODEL = 'qwen/qwen3-32b'

// Free tier requests per day (September 2026)
export const DEFAULT_GEMINI_LITE_DAILY_LIMIT = 500
export const DEFAULT_GEMINI_DAILY_LIMIT = 20
export const DEFAULT_GROQ_DAILY_LIMIT = 1000

// Stop using a model once this share of its daily quota is spent
export const AI_QUOTA_USAGE_THRESHOLD = 0.9

// Timezone where each provider resets its daily quota
export const AI_QUOTA_TIME_ZONES: Record<AiProvider, string> = {
  [AiProvider.GEMINI]: 'America/Los_Angeles',
  [AiProvider.GROQ]: 'UTC',
}

export const DEFAULT_AI_TIMEOUT_MS = 20_000

// Attempts per model when the output does not match the schema
export const AI_MAX_STRUCTURE_ATTEMPTS = 2

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
