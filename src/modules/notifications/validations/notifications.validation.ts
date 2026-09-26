import { z } from 'zod'

import { NotificationJob, NotificationKind, NotificationRefType } from '@/commons/constants/notification.constant'
import { dateTimeSchema } from '@/commons/helpers/api-response.helper'
import { calendarEventResponseSchema } from '@/modules/calendar/validations/calendar.validation'

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true')

export const notificationListQuerySchema = z.object({
  kind: z.enum(NotificationKind).optional(),
  unread: booleanQuery.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export const recentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const remindersQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(45).default(14),
})

const channelSettings = z.object({ telegram: z.boolean(), web: z.boolean() })

// Only the kinds that change; each one with the channels that change
export const updateSettingsSchema = z.partialRecord(z.enum(NotificationKind), channelSettings.partial())

// ==================== Responses (Swagger / kogane-app types) ====================

export const notificationResponseSchema = z.object({
  id: z.string(),
  kind: z.enum(NotificationKind),
  title: z.string(),
  body: z.string(),
  amount: z.number().nullable(),
  refType: z.enum(NotificationRefType).nullable(),
  refId: z.string().nullable(),
  eventDate: dateTimeSchema.nullable(),
  readAt: dateTimeSchema.nullable(),
  telegramSentAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
})

export const notificationPageResponseSchema = z.object({
  items: z.array(notificationResponseSchema),
  total: z.number().int(),
})

export const unreadCountResponseSchema = z.object({ unread: z.number().int() })

export const readAllResponseSchema = z.object({ updated: z.number().int() })

export const notificationSettingsResponseSchema = z.record(z.enum(NotificationKind), channelSettings)

export const jobResultResponseSchema = z.object({
  job: z.enum(NotificationJob),
  notifications: z.number().int().describe('Created in this run (existing ones are never repeated)'),
  details: z.record(z.string(), z.unknown()).optional(),
})

export const remindersResponseSchema = z.array(calendarEventResponseSchema)
