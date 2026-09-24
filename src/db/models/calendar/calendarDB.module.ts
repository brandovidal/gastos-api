import { Module } from '@nestjs/common'

import { CalendarDBRepository } from './calendarDB.repository'

@Module({
  providers: [CalendarDBRepository],
  exports: [CalendarDBRepository],
})
export class CalendarDBModule {}
