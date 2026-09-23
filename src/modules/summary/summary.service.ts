import { Injectable } from '@nestjs/common'

import { Currency, ExpenseDestination } from '@/commons/constants/expense.constant'
import { BudgetGroupDBRepository } from '@/db/models/budget-group/budgetGroupDB.repository'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { MonthlyBudgetDBRepository } from '@/db/models/monthly-budget/monthlyBudgetDB.repository'

import { MonthlyBudgetDto, SummaryQueryDto } from './dto/request/summary.dto'

// Dashboard of kogane-app (P7): month totals by destination and person, budget and budget groups.
// Receivables are money others owe you: they are not spending (P17 reworks them as debts).
@Injectable()
export class SummaryService {
  constructor(
    private readonly expenseDBRepository: ExpenseDBRepository,
    private readonly monthlyBudgetDBRepository: MonthlyBudgetDBRepository,
    private readonly budgetGroupDBRepository: BudgetGroupDBRepository,
  ) {}

  async get({ month, year }: SummaryQueryDto) {
    const [totals, budget, budgetGroups] = await Promise.all([
      this.expenseDBRepository.findMonthlyTotals(month, year),
      this.monthlyBudgetDBRepository.findByMonth(month, year),
      this.budgetGroupDBRepository.findAll(),
    ])

    const spentPen = totals
      .filter((row) => row.currency === Currency.PEN && row.destination !== ExpenseDestination.RECEIVABLE)
      .reduce((sum, row) => sum + row.total, 0)
    const salary = budget?.salary ?? null
    const limit = salary != null ? (salary * (budget?.limitPercent ?? 100)) / 100 : null

    return {
      month,
      year,
      totals,
      spentPen,
      budget: budget ? { salary: budget.salary, limitPercent: budget.limitPercent, limit } : null,
      // same as the Notion Resumen: salary minus what was spent
      surplus: salary != null ? salary - spentPen : null,
      budgetGroups: budgetGroups.map((group) => ({
        ...group,
        amount: salary != null ? (salary * group.percentage) / 100 : null,
      })),
    }
  }

  setBudget(body: MonthlyBudgetDto) {
    return this.monthlyBudgetDBRepository.upsert(body)
  }
}
