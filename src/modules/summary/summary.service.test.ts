import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { MonthlyBudgetDBRepository } from '@/db/models/monthly-budget/monthlyBudgetDB.repository'
import { BudgetService } from '@/modules/budget/budget.service'

import { SummaryService } from './summary.service'

const mockExpenseDB = { findMonthlyTotals: vi.fn() }
const mockMonthlyBudgetDB = { upsert: vi.fn() }
const mockBudget = { month: vi.fn(), history: vi.fn() }

describe('SummaryService', () => {
  let service: SummaryService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SummaryService,
        { provide: ExpenseDBRepository, useValue: mockExpenseDB },
        { provide: MonthlyBudgetDBRepository, useValue: mockMonthlyBudgetDB },
        { provide: BudgetService, useValue: mockBudget },
      ],
    }).compile()
    service = module.get(SummaryService)
  })

  afterEach(() => vi.clearAllMocks())

  it('should join the month totals by destination and person with the budget of the month (P19)', async () => {
    const totals = [{ destination: 'daily', currency: 'PEN', personId: 'p1', total: 100, count: 2 }]
    const budget = {
      budget: null,
      incomes: [],
      extraIncome: 0,
      spentPen: 100,
      surplus: null,
      byCategory: [],
      budgetGroups: [],
    }
    mockExpenseDB.findMonthlyTotals.mockResolvedValue(totals)
    mockBudget.month.mockResolvedValue(budget)

    expect(await service.get({ month: 9, year: 2026 })).toEqual({ month: 9, year: 2026, totals, ...budget })
    expect(mockBudget.month).toHaveBeenCalledWith(9, 2026)
  })

  it('should give the history of the budget and save the salary of a month', async () => {
    mockBudget.history.mockResolvedValue([])
    await service.history({ month: 9, year: 2026, months: 6 })
    expect(mockBudget.history).toHaveBeenCalledWith(9, 2026, 6)

    await service.setBudget({ month: 9, year: 2026, salary: 4000, limitPercent: 90 })
    expect(mockMonthlyBudgetDB.upsert).toHaveBeenCalledWith({ month: 9, year: 2026, salary: 4000, limitPercent: 90 })
  })
})
