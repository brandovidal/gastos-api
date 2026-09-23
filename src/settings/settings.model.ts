import { AiProvider } from '@/commons/constants/ai.constant'

export interface AppConfig {
  env: string
  port: number
}

export interface AuthConfig {
  apiKey?: string
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
  webhookSecret?: string
  allowedChatIds: string[]
}
