import { Injectable } from '@nestjs/common'

import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { MonthlyBudgetDBRepository } from '@/db/models/monthly-budget/monthlyBudgetDB.repository'
import { BudgetService } from '@/modules/budget/budget.service'

import { HistoryQueryDto, MonthlyBudgetDto, SummaryQueryDto } from './dto/request/summary.dto'

// Dashboard of kogane-app: month totals by destination and person, and the budget of the month (P19):
// salary (or the latest one as a proposal), extra incomes, spending per category and group, surplus (D65)
@Injectable()
export class SummaryService {
  constructor(
    private readonly expenseDBRepository: ExpenseDBRepository,
    private readonly monthlyBudgetDBRepository: MonthlyBudgetDBRepository,
    private readonly budgetService: BudgetService,
  ) {}

  async get({ month, year }: SummaryQueryDto) {
    const [totals, budget] = await Promise.all([
      this.expenseDBRepository.findMonthlyTotals(month, year),
      this.budgetService.month(month, year),
    ])
    return { month, year, totals, ...budget }
  }

  history({ month, year, months }: HistoryQueryDto) {
    return this.budgetService.history(month, year, months)
  }

  setBudget(body: MonthlyBudgetDto) {
    return this.monthlyBudgetDBRepository.upsert(body)
  }
}
