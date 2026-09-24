import { Module } from '@nestjs/common'

import { BudgetGroupDBModule } from '@/db/models/budget-group/budgetGroupDB.module'
import { CategoryBudgetDBModule } from '@/db/models/category-budget/categoryBudgetDB.module'
import { CategoryDBModule } from '@/db/models/category/categoryDB.module'
import { ExpenseDBModule } from '@/db/models/expense/expenseDB.module'
import { IncomeDBModule } from '@/db/models/income/incomeDB.module'
import { MonthlyBudgetDBModule } from '@/db/models/monthly-budget/monthlyBudgetDB.module'
import { PersonDBModule } from '@/db/models/person/personDB.module'

import { BudgetService } from './budget.service'
import { CategoryBudgetsController } from './category-budgets.controller'
import { IncomesController } from './incomes.controller'
import { IncomesService } from './incomes.service'

// Presupuesto (P19): extra incomes, limits per category and the month's budget used by /v1/summary and the bot
@Module({
  imports: [
    ExpenseDBModule,
    MonthlyBudgetDBModule,
    IncomeDBModule,
    CategoryBudgetDBModule,
    CategoryDBModule,
    BudgetGroupDBModule,
    PersonDBModule,
  ],
  controllers: [IncomesController, CategoryBudgetsController],
  providers: [BudgetService, IncomesService],
  exports: [BudgetService],
})
export class BudgetModule {}
