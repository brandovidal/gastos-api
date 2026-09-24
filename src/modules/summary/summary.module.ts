import { Module } from '@nestjs/common'

import { ExpenseDBModule } from '@/db/models/expense/expenseDB.module'
import { MonthlyBudgetDBModule } from '@/db/models/monthly-budget/monthlyBudgetDB.module'
import { BudgetModule } from '@/modules/budget/budget.module'

import { SummaryController } from './summary.controller'
import { SummaryService } from './summary.service'

@Module({
  imports: [ExpenseDBModule, MonthlyBudgetDBModule, BudgetModule],
  controllers: [SummaryController],
  providers: [SummaryService],
})
export class SummaryModule {}
