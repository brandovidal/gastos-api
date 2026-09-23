import * as process from 'process'

import {
  DEFAULT_AI_TIMEOUT_MS,
  DEFAULT_GEMINI_DAILY_LIMIT,
  DEFAULT_GEMINI_LITE_DAILY_LIMIT,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_LITE,
  DEFAULT_GROQ_DAILY_LIMIT,
  DEFAULT_GROQ_MODEL,
  DEFAULT_GROQ_TRANSCRIBE_DAILY_LIMIT,
  DEFAULT_GROQ_TRANSCRIBE_MODEL,
  AiProvider,
} from '@/commons/constants/ai.constant'

export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'dev',
    port: Number(process.env.PORT ?? 5560),
  },
  auth: {
    apiKey: process.env.API_KEY,
  },
  // Screenshots and voice notes (D54): Cloudflare R2 when its keys are set, a local folder otherwise
  storage: {
    r2AccountId: process.env.R2_ACCOUNT_ID,
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    r2Bucket: process.env.R2_BUCKET ?? 'kogane-captures',
    localDir: process.env.STORAGE_LOCAL_DIR ?? '.data/storage',
  },
  db: {
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
  ai: {
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? DEFAULT_AI_TIMEOUT_MS),
    // Primary model for text (D37): groq (Qwen, then Flash-Lite; default) or gemini. Images always use Gemini
    textPrimary: process.env.AI_TEXT_PRIMARY === AiProvider.GEMINI ? AiProvider.GEMINI : AiProvider.GROQ,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    modelLite: process.env.GEMINI_MODEL_LITE ?? DEFAULT_GEMINI_MODEL_LITE,
    model: process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL,
    dailyLimitLite: Number(process.env.GEMINI_LITE_DAILY_LIMIT ?? DEFAULT_GEMINI_LITE_DAILY_LIMIT),
    dailyLimit: Number(process.env.GEMINI_DAILY_LIMIT ?? DEFAULT_GEMINI_DAILY_LIMIT),
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowedChatIds: (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
      .split(',')
      .map((chatId) => chatId.trim())
      .filter(Boolean),
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
    dailyLimit: Number(process.env.GROQ_DAILY_LIMIT ?? DEFAULT_GROQ_DAILY_LIMIT),
    transcribeModel: process.env.GROQ_TRANSCRIBE_MODEL ?? DEFAULT_GROQ_TRANSCRIBE_MODEL,
    transcribeDailyLimit: Number(process.env.GROQ_TRANSCRIBE_DAILY_LIMIT ?? DEFAULT_GROQ_TRANSCRIBE_DAILY_LIMIT),
  },
})
