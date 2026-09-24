import { Module } from '@nestjs/common'

import { SettingsModule } from './settings/settings.module'
import { LoggerModule } from './providers/logger/logger.module'
import { PrismaModule } from './db/prisma/prisma.module'
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

@Module({
  imports: [
    SettingsModule,
    LoggerModule,
    PrismaModule,
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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
