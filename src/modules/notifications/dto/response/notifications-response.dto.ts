import { z } from 'zod'

import { responseDto } from '@/commons/helpers/api-response.helper'

import {
  jobResultResponseSchema,
  notificationPageResponseSchema,
  notificationResponseSchema,
  notificationSettingsResponseSchema,
  readAllResponseSchema,
  remindersResponseSchema,
  unreadCountResponseSchema,
} from '../../validations/notifications.validation'

export class NotificationPageResponseDto extends responseDto(notificationPageResponseSchema) {}
export class RecentNotificationsResponseDto extends responseDto(z.array(notificationResponseSchema)) {}
export class UnreadCountResponseDto extends responseDto(unreadCountResponseSchema) {}
export class ReadAllResponseDto extends responseDto(readAllResponseSchema) {}
export class NotificationSettingsResponseDto extends responseDto(notificationSettingsResponseSchema) {}
export class JobResultResponseDto extends responseDto(jobResultResponseSchema) {}
export class RemindersResponseDto extends responseDto(remindersResponseSchema) {}
