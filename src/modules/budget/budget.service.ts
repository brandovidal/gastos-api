import { Injectable } from '@nestjs/common'

import { BudgetStatus, DEFAULT_ALERT_THRESHOLD } from '@/commons/constants/budget.constant'
import { Currency } from '@/commons/constants/expense.constant'
import { addMonths, PaymentPeriod } from '@/commons/helpers/payment-period.helper'
import { BudgetGroupDBRepository } from '@/db/models/budget-group/budgetGroupDB.repository'
import { CategoryBudgetDBRepository } from '@/db/models/category-budget/categoryBudgetDB.repository'
import { CategoryDBRepository } from '@/db/models/category/categoryDB.repository'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { IncomeDBRepository } from '@/db/models/income/incomeDB.repository'
import { MonthlyBudgetDBRepository } from '@/db/models/monthly-budget/monthlyBudgetDB.repository'
import { PersonDBRepository } from '@/db/models/person/personDB.repository'

import { budgetStatus, crossedStatus, percentOf, surplusOf } from './budget.calculator'

export interface MonthBudget {
  salary: number
  limitPercent: number
  limit: number
  isProposal: boolean // no salary for this month yet: the one of the latest month, saved with PUT /v1/summary/budget
}

export interface CategoryBudgetLine {
  categoryId: string | null // null: expenses without category
  name: string
  color: string
  icon: string | null
  budgetGroupId: string | null
  spent: number
  limit: number | null
  budgetId: string | null // the CategoryBudget row that sets the limit (to edit or remove it)
  limitMonthOnly: boolean // true: the limit is only for this month; false: for every month
  alertThreshold: number
  percent: number | null
  status: BudgetStatus | null // null without limit
}

export interface BudgetAlert {
  category: string
  percent: number
  status: BudgetStatus
}

const round2 = (value: number) => Math.round(value * 100) / 100

// Budget of a month (P19): salary, extra incomes, spending per category against its limit and the surplus (D65).
// Only the expenses of the default person count (D71): what others spend is theirs, what they owe is a debt.
@Injectable()
export class BudgetService {
  constructor(
    private readonly expenseDBRepository: ExpenseDBRepository,
    private readonly monthlyBudgetDBRepository: MonthlyBudgetDBRepository,
    private readonly incomeDBRepository: IncomeDBRepository,
    private readonly categoryBudgetDBRepository: CategoryBudgetDBRepository,
    private readonly categoryDBRepository: CategoryDBRepository,
    private readonly budgetGroupDBRepository: BudgetGroupDBRepository,
    private readonly personDBRepository: PersonDBRepository,
  ) {}

  async month(month: number, year: number) {
    const [budget, incomes, byCategory, groups] = await Promise.all([
      this.monthBudget(month, year),
      this.incomeDBRepository.findByMonth(month, year),
      this.byCategory(month, year),
      this.budgetGroupDBRepository.findAll(),
    ])
    const spentPen = round2(byCategory.reduce((sum, line) => sum + line.spent, 0))
    const extraIncome = round2(
      incomes.filter((income) => income.currency === Currency.PEN).reduce((sum, income) => sum + income.amount, 0),
    )

    return {
      budget,
      incomes,
      extraIncome,
      spentPen,
      surplus: surplusOf(budget?.salary ?? null, extraIncome, spentPen),
      byCategory,
      budgetGroups: groups.map((group) => {
        const spent = round2(
          byCategory.filter((line) => line.budgetGroupId === group.id).reduce((sum, line) => sum + line.spent, 0),
        )
        const amount = budget ? round2((budget.salary * group.percentage) / 100) : null
        return { ...group, amount, spent, percent: amount ? percentOf(spent, amount) : null }
      }),
    }
  }

  // The month's own salary, or the latest one as a proposal
  async monthBudget(month: number, year: number): Promise<MonthBudget | null> {
    const own = await this.monthlyBudgetDBRepository.findByMonth(month, year)
    const budget = own ?? (await this.monthlyBudgetDBRepository.findLatestBefore(month, year))
    if (!budget) return null
    return {
      salary: budget.salary,
      limitPercent: budget.limitPercent,
      limit: round2((budget.salary * budget.limitPercent) / 100),
      isProposal: !own,
    }
  }

  // Every category with spending or a limit, biggest spending first; "Sin categoría" when something has none
  async byCategory(month: number, year: number): Promise<CategoryBudgetLine[]> {
    const owner = await this.personDBRepository.findDefault()
    const [spent, limits, categories] = await Promise.all([
      this.expenseDBRepository.findSpentByCategory(month, year, owner?.id),
      this.categoryBudgetDBRepository.findEffective(month, year),
      this.categoryDBRepository.findAll(),
    ])
    const spentBy = new Map(spent.map((row) => [row.categoryId, row.total]))
    const limitBy = new Map(limits.map((row) => [row.categoryId, row]))

    const lines: CategoryBudgetLine[] = categories
      .filter((category) => spentBy.has(category.id) || limitBy.has(category.id))
      .map((category) => {
        const limit = limitBy.get(category.id)
        const total = round2(spentBy.get(category.id) ?? 0)
        const alertThreshold = limit?.alertThreshold ?? DEFAULT_ALERT_THRESHOLD
        return {
          categoryId: category.id,
          name: category.name,
          color: category.color,
          icon: category.icon,
          budgetGroupId: category.budgetGroupId,
          spent: total,
          limit: limit?.monthlyLimit ?? null,
          budgetId: limit?.id ?? null,
          limitMonthOnly: limit?.month != null,
          alertThreshold,
          percent: limit ? percentOf(total, limit.monthlyLimit) : null,
          status: limit ? budgetStatus(total, limit.monthlyLimit, alertThreshold) : null,
        }
      })

    const uncategorized = spentBy.get(null)
    if (uncategorized) {
      lines.push({
        categoryId: null,
        name: 'Sin categoría',
        color: '#6B7280',
        icon: null,
        budgetGroupId: null,
        spent: round2(uncategorized),
        limit: null,
        budgetId: null,
        limitMonthOnly: false,
        alertThreshold: DEFAULT_ALERT_THRESHOLD,
        percent: null,
        status: null,
      })
    }
    return lines.sort((a, b) => b.spent - a.spent)
  }

  // Surplus of the last `months` months up to the given one, oldest first (bar chart of kogane-app)
  async history(month: number, year: number, months: number) {
    const periods = Array.from({ length: months }, (_, index) =>
      addMonths({ paymentMonth: month, paymentYear: year }, index - months + 1),
    )
    return Promise.all(
      periods.map(async ({ paymentMonth, paymentYear }) => {
        const { budget, extraIncome, spentPen, surplus } = await this.month(paymentMonth, paymentYear)
        return {
          month: paymentMonth,
          year: paymentYear,
          salary: budget?.salary ?? null,
          extraIncome,
          spentPen,
          surplus,
        }
      }),
    )
  }

  // After saving an expense of `amount` in that category and budget month: the alert when it crossed 80 % or 100 %
  async alertAfterSave(
    categoryId: string | null,
    period: PaymentPeriod,
    amount: number,
    personId: string,
  ): Promise<BudgetAlert | null> {
    if (!categoryId || personId !== (await this.personDBRepository.findDefault())?.id) return null
    const line = (await this.byCategory(period.paymentMonth, period.paymentYear)).find(
      (candidate) => candidate.categoryId === categoryId,
    )
    if (!line || line.limit == null) return null
    const status = crossedStatus(line.spent - amount, line.spent, line.limit, line.alertThreshold)
    return status ? { category: line.name, percent: percentOf(line.spent, line.limit), status } : null
  }
}
