import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { BudgetStatus } from '@/commons/constants/budget.constant'
import { BudgetGroupDBRepository } from '@/db/models/budget-group/budgetGroupDB.repository'
import { CategoryBudgetDBRepository } from '@/db/models/category-budget/categoryBudgetDB.repository'
import { CategoryDBRepository } from '@/db/models/category/categoryDB.repository'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { IncomeDBRepository } from '@/db/models/income/incomeDB.repository'
import { MonthlyBudgetDBRepository } from '@/db/models/monthly-budget/monthlyBudgetDB.repository'
import { PersonDBRepository } from '@/db/models/person/personDB.repository'

import { BudgetService } from './budget.service'

const mockExpenseDB = { findSpentByCategory: vi.fn() }
const mockMonthlyBudgetDB = { findByMonth: vi.fn(), findLatestBefore: vi.fn() }
const mockIncomeDB = { findByMonth: vi.fn() }
const mockCategoryBudgetDB = { findEffective: vi.fn() }
const mockCategoryDB = { findAll: vi.fn() }
const mockBudgetGroupDB = { findAll: vi.fn() }
const mockPersonDB = { findDefault: vi.fn() }

const category = (id: string, name: string, budgetGroupId: string | null = null) => ({
  id,
  name,
  color: '#111111',
  icon: null,
  budgetGroupId,
})

describe('BudgetService', () => {
  let service: BudgetService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetService,
        { provide: ExpenseDBRepository, useValue: mockExpenseDB },
        { provide: MonthlyBudgetDBRepository, useValue: mockMonthlyBudgetDB },
        { provide: IncomeDBRepository, useValue: mockIncomeDB },
        { provide: CategoryBudgetDBRepository, useValue: mockCategoryBudgetDB },
        { provide: CategoryDBRepository, useValue: mockCategoryDB },
        { provide: BudgetGroupDBRepository, useValue: mockBudgetGroupDB },
        { provide: PersonDBRepository, useValue: mockPersonDB },
      ],
    }).compile()
    service = module.get(BudgetService)

    mockPersonDB.findDefault.mockResolvedValue({ id: 'person-brando', name: 'Brando' })
    mockCategoryDB.findAll.mockResolvedValue([
      category('food', 'Comida', 'group-basic'),
      category('fun', 'Entretenimiento'),
      category('gifts', 'Regalos'),
    ])
    mockExpenseDB.findSpentByCategory.mockResolvedValue([
      { categoryId: 'food', total: 425 },
      { categoryId: 'fun', total: 100 },
      { categoryId: null, total: 50 },
    ])
    mockCategoryBudgetDB.findEffective.mockResolvedValue([
      { categoryId: 'food', monthlyLimit: 500, alertThreshold: 80 },
    ])
    mockMonthlyBudgetDB.findByMonth.mockResolvedValue({ salary: 4000, limitPercent: 90 })
    mockIncomeDB.findByMonth.mockResolvedValue([
      { amount: 300, currency: 'PEN' },
      { amount: 20, currency: 'USD' },
    ])
    mockBudgetGroupDB.findAll.mockResolvedValue([{ id: 'group-basic', name: 'Básicos', percentage: 50 }])
  })

  afterEach(() => vi.clearAllMocks())

  it('should list spending against the limit per category, biggest first, with "Sin categoría" at its place', async () => {
    const lines = await service.byCategory(9, 2026)

    // only the expenses of the default person count (D71)
    expect(mockExpenseDB.findSpentByCategory).toHaveBeenCalledWith(9, 2026, 'person-brando')
    expect(lines.map((line) => [line.name, line.spent, line.limit, line.percent, line.status])).toEqual([
      ['Comida', 425, 500, 85, BudgetStatus.WARNING],
      ['Entretenimiento', 100, null, null, null],
      ['Sin categoría', 50, null, null, null],
    ])
  })

  it('should compute the month: spent, PEN extra incomes, surplus (D65) and each group against its share', async () => {
    const month = await service.month(9, 2026)

    expect(month.spentPen).toBe(575)
    expect(month.extraIncome).toBe(300)
    expect(month.surplus).toBe(3725) // 4000 + 300 − 575
    expect(month.budget).toEqual({ salary: 4000, limitPercent: 90, limit: 3600, isProposal: false })
    expect(month.budgetGroups[0]).toMatchObject({ amount: 2000, spent: 425, percent: 21.25 })
  })

  it('should propose the salary of the latest month when the month has none', async () => {
    mockMonthlyBudgetDB.findByMonth.mockResolvedValue(null)
    mockMonthlyBudgetDB.findLatestBefore.mockResolvedValue({ salary: 3800, limitPercent: 100 })

    expect(await service.monthBudget(10, 2026)).toEqual({
      salary: 3800,
      limitPercent: 100,
      limit: 3800,
      isProposal: true,
    })
    expect(mockMonthlyBudgetDB.findLatestBefore).toHaveBeenCalledWith(10, 2026)
  })

  it('should alert when the saved expense made its category cross the threshold', async () => {
    // Comida is at 425 of 500 after saving 60: it was at 365 (73 %)
    const september = { paymentMonth: 9, paymentYear: 2026 }
    expect(await service.alertAfterSave('food', september, 60, 'person-brando')).toEqual({
      category: 'Comida',
      percent: 85,
      status: BudgetStatus.WARNING,
    })
    // already above 80 % before this one
    expect(await service.alertAfterSave('food', september, 10, 'person-brando')).toBeNull()
    // an expense of someone else does not touch your budget (D71)
    expect(await service.alertAfterSave('food', september, 60, 'person-danery')).toBeNull()
    // without a limit or a category
    expect(await service.alertAfterSave('fun', september, 60, 'person-brando')).toBeNull()
    expect(await service.alertAfterSave(null, september, 60, 'person-brando')).toBeNull()
  })

  it('should give the surplus of the last months, oldest first, across the year change', async () => {
    const history = await service.history(1, 2027, 3)

    expect(history.map(({ month, year }) => [month, year])).toEqual([
      [11, 2026],
      [12, 2026],
      [1, 2027],
    ])
    expect(history[0]).toMatchObject({ salary: 4000, extraIncome: 300, spentPen: 575, surplus: 3725 })
  })
})
