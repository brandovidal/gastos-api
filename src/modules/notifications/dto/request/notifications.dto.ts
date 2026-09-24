import { createZodDto } from 'nestjs-zod'

import {
  notificationListQuerySchema,
  recentQuerySchema,
  remindersQuerySchema,
  updateSettingsSchema,
} from '../../validations/notifications.validation'

export class NotificationListQueryDto extends createZodDto(notificationListQuerySchema) {}
export class RecentNotificationsQueryDto extends createZodDto(recentQuerySchema) {}
export class RemindersQueryDto extends createZodDto(remindersQuerySchema) {}
export class UpdateNotificationSettingsDto extends createZodDto(updateSettingsSchema) {}
