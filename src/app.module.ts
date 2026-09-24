import { Module } from '@nestjs/common'

import { SettingsModule } from './settings/settings.module'
import { LoggerModule } from './providers/logger/logger.module'
import { PrismaModule } from './db/prisma/prisma.module'
import { RedisModule } from './providers/redis/redis.module'
import { HealthModule } from '@/modules/health/health.module'
import { TelegramModule } from '@/modules/telegram/telegram.module'
import { CatalogsModule } from '@/modules/catalogs/catalogs.module'
import { ExpensesModule } from '@/modules/expenses/expenses.module'
import { DraftsModule } from '@/modules/drafts/drafts.module'
import { MessagesModule } from '@/modules/messages/messages.module'
import { SummaryModule } from '@/modules/summary/summary.module'
import { DebtsModule } from '@/modules/debts/debts.module'
import { BudgetModule } from '@/modules/budget/budget.module'
import { ReportsModule } from '@/modules/reports/reports.module'
import { CalendarModule } from '@/modules/calendar/calendar.module'
import { NotificationQueueModule } from '@/modules/notifications/notification-queue.module'
import { NotificationsModule } from '@/modules/notifications/notifications.module'

@Module({
  imports: [
    SettingsModule,
    LoggerModule,
    PrismaModule,
    // Reminders (P20, D87): Redis + BullMQ queues, both optional without REDIS_URL
    RedisModule,
    NotificationQueueModule,
    HealthModule,
    TelegramModule,
    // REST API for kogane-app (P7)
    CatalogsModule,
    ExpensesModule,
    DraftsModule,
    MessagesModule,
    SummaryModule,
    DebtsModule,
    BudgetModule,
    ReportsModule,
    CalendarModule,
    NotificationsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
