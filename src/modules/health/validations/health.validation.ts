import { z } from 'zod'

import { WebhookStatus } from '@/commons/constants/telegram.constant'

export const telegramHealthSchema = z.object({
  webhook: z
    .enum(WebhookStatus)
    .describe('NOT_CONFIGURED without bot token; ERROR if Telegram failed to deliver recently'),
  pendingUpdates: z.number().int().nullable().describe('Updates Telegram is still trying to deliver'),
  lastError: z.string().nullable(),
  lastErrorAt: z.iso.datetime().nullable(),
})

export const healthSchema = z.object({
  status: z.literal('OK'),
  database: z.enum(['OK', 'DOWN']),
  redis: z.enum(['OK', 'DOWN', 'DISABLED']).describe('Reminders queues (P20); DISABLED without REDIS_URL'),
  telegram: telegramHealthSchema,
  timestamp: z.iso.datetime(),
})

export type TelegramHealth = z.infer<typeof telegramHealthSchema>
