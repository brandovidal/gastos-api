import { Module } from '@nestjs/common'

import { BudgetGroupDBModule } from '@/db/models/budget-group/budgetGroupDB.module'
import { ExpenseDBModule } from '@/db/models/expense/expenseDB.module'
import { MonthlyBudgetDBModule } from '@/db/models/monthly-budget/monthlyBudgetDB.module'

import { SummaryController } from './summary.controller'
import { SummaryService } from './summary.service'

@Module({
  imports: [ExpenseDBModule, MonthlyBudgetDBModule, BudgetGroupDBModule],
  controllers: [SummaryController],
  providers: [SummaryService],
})
export class SummaryModule {}
