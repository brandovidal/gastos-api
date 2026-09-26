import { AiProvider } from '@/commons/constants/ai.constant'

export interface MailConfig {
  user?: string
  appPassword?: string
  fromName: string
}

export interface AuthConfig {
  apiKey?: string
  appUrl: string
  googleClientId?: string
  googleClientSecret?: string
  adminBootstrapKey?: string
}

export interface StorageConfig {
  env?: string // StorageEnv
  r2AccountId?: string
  r2AccessKeyId?: string
  r2SecretAccessKey?: string
  r2Bucket: string
  localDir: string
}

export interface OcrConfig {
  enabled: boolean
  cacheDir: string // where tesseract.js keeps the Spanish model (downloaded once)
}

export interface RedisConfig {
  url?: string
}

export interface DatabaseConfig {
  url: string
  authToken?: string
}

export interface AiConfig {
  timeoutMs: number
  textPrimary: AiProvider
}

export interface GeminiConfig {
  apiKey?: string
  modelLite: string
  model: string
  dailyLimitLite: number
  dailyLimit: number
}

export interface GroqConfig {
  apiKey?: string
  model: string
  dailyLimit: number
  transcribeModel: string
  transcribeDailyLimit: number
}

export interface TelegramConfig {
  botToken?: string
  botUsername: string
  webhookSecret?: string
  allowedChatIds: string[]
}
