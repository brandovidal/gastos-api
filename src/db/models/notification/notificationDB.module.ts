import { Module } from '@nestjs/common'

import { NotificationDBRepository } from './notificationDB.repository'

@Module({
  providers: [NotificationDBRepository],
  exports: [NotificationDBRepository],
})
export class NotificationDBModule {}
