import { Notification } from '@/generated/prisma/client'

export type CreateNotificationDbDto = Pick<Notification, 'kind' | 'title' | 'body' | 'dedupeKey'> &
  Partial<Pick<Notification, 'amount' | 'refType' | 'refId' | 'eventDate' | 'readAt'>>

export interface NotificationFilterDbDto {
  kind?: string
  unread?: boolean
  limit: number
  offset: number
}
