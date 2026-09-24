import { Module } from '@nestjs/common'

import { CalendarDBModule } from '@/db/models/calendar/calendarDB.module'
import { DebtsModule } from '@/modules/debts/debts.module'

import { CalendarController } from './calendar.controller'
import { CalendarService } from './calendar.service'

@Module({
  imports: [CalendarDBModule, DebtsModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
