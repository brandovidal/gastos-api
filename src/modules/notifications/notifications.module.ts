import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'

import { CalendarDBModule } from '@/db/models/calendar/calendarDB.module'
import { ExpenseDBModule } from '@/db/models/expense/expenseDB.module'
import { NotificationDBModule } from '@/db/models/notification/notificationDB.module'
import { PersonDBModule } from '@/db/models/person/personDB.module'
import { TelegramProviderModule } from '@/providers/telegram/telegram.module'
import { BudgetModule } from '@/modules/budget/budget.module'
import { CalendarModule } from '@/modules/calendar/calendar.module'
import { DebtsModule } from '@/modules/debts/debts.module'
import { ExpensesModule } from '@/modules/expenses/expenses.module'
import { StoredFilesModule } from '@/modules/stored-files/stored-files.module'

import { NotificationCache } from './notification-cache.service'
import { NotificationJobsService } from './notification-jobs.service'
import { NotificationWorkers } from './notification-workers.service'
import { NotificationsBotService } from './notifications-bot.service'
import { NotificationsController, RemindersController } from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { UpcomingRefreshInterceptor } from './upcoming-refresh.interceptor'

// Reminders and notifications (P20, D86, D87). NotificationQueue comes from the global NotificationQueueModule.
@Module({
  imports: [
    NotificationDBModule,
    CalendarDBModule,
    ExpenseDBModule,
    PersonDBModule,
    TelegramProviderModule,
    CalendarModule,
    BudgetModule,
    DebtsModule,
    ExpensesModule,
    StoredFilesModule,
  ],
  controllers: [NotificationsController, RemindersController],
  providers: [
    NotificationsService,
    NotificationCache,
    NotificationJobsService,
    NotificationWorkers,
    NotificationsBotService,
    { provide: APP_INTERCEPTOR, useClass: UpcomingRefreshInterceptor },
  ],
  exports: [NotificationsService, NotificationsBotService],
})
export class NotificationsModule {}
