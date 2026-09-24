import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'
import { DebtDirection, OPEN_DEBT_STATUSES } from '@/commons/constants/debt.constant'
import { Currency, ExpenseDestination } from '@/commons/constants/expense.constant'
import { ExpenseDraftStatus } from '@/commons/constants/expense-draft.constant'
import { SavedExpenseLockedException } from '@/commons/exceptions/expense/saved-expense-locked.exception'

import { CategorySpentDbDto, MonthlyTotalDbDto, SaveExpenseDbDto } from './expenseDB.dto'

type Transaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0]

@Injectable()
export class ExpenseDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Creates the expense and marks its ExpenseDraft as saved in one transaction. With replacesDraftId (/editar, D76) the
  // rows of that saved draft (its record, installments and shared debts) are deleted first and it stops being saved.
  async saveFromExpenseDraft(
    draftId: string,
    input: SaveExpenseDbDto,
    replacesDraftId?: string,
  ): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      if (replacesDraftId) await this.deleteRowsOf(tx, replacesDraftId)
      const record = await this.createRecord(tx, draftId, input)
      if (input.sharedDebts?.length) await tx.debt.createMany({ data: input.sharedDebts })

      await tx.expenseDraft.update({
        where: { id: draftId },
        data: { status: ExpenseDraftStatus.SAVED, pendingField: null, confirmedAt: new Date() },
      })

      return { id: record.id }
    })
  }

  // PEN spent per category in a month (P19), your part of shared expenses only (D73): day to day by date, fixed costs and cards by payment month. Subscriptions
  // are left out: their charge is already a card expense (D46). categoryId null: expenses without category.
  // With personId, only that person's expenses (the budget counts only yours, D71)
  async findSpentByCategory(month: number, year: number, personId?: string): Promise<CategorySpentDbDto[]> {
    const person = personId ? { personId } : {}
    const period = { paymentMonth: month, paymentYear: year, currency: Currency.PEN, ...person }
    const aggregate = { by: ['categoryId'] as ['categoryId'], _sum: { amount: true, othersShare: true } } as const
    const [daily, fixedCosts, creditCards] = await Promise.all([
      this.prisma.dailyExpense.groupBy({
        ...aggregate,
        where: {
          currency: Currency.PEN,
          ...person,
          spentAt: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) },
        },
      }),
      this.prisma.fixedCost.groupBy({ ...aggregate, where: period }),
      this.prisma.creditCardExpense.groupBy({ ...aggregate, where: period }),
    ])

    const totals = new Map<string | null, number>()
    for (const row of [...daily, ...fixedCosts, ...creditCards]) {
      // Your part (D73): what others owe of a shared expense is not your spending
      const own = (row._sum.amount ?? 0) - (row._sum.othersShare ?? 0)
      totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + own)
    }
    return [...totals].map(([categoryId, total]) => ({ categoryId, total }))
  }

  // Totals of the month per destination, currency and person (debts: the balance of everything not paid yet)
  async findMonthlyTotals(month: number, year: number): Promise<MonthlyTotalDbDto[]> {
    const where = { paymentMonth: month, paymentYear: year }
    const monthStart = new Date(Date.UTC(year, month - 1, 1))
    const nextMonthStart = new Date(Date.UTC(year, month, 1))
    const by: ['currency', 'personId'] = ['currency', 'personId']
    const aggregate = { _sum: { amount: true }, _count: { _all: true } } as const

    const [daily, fixedCosts, subscriptions, creditCards, debts] = await Promise.all([
      this.prisma.dailyExpense.groupBy({
        by,
        where: { spentAt: { gte: monthStart, lt: nextMonthStart } },
        ...aggregate,
      }),
      this.prisma.fixedCost.groupBy({ by, where, ...aggregate }),
      this.prisma.subscription.groupBy({ by, where, ...aggregate }),
      this.prisma.creditCardExpense.groupBy({ by, where, ...aggregate }),
      this.prisma.debt.groupBy({
        by: ['currency', 'personId', 'direction'],
        where: { status: { in: OPEN_DEBT_STATUSES } },
        _sum: { amount: true, paidAmount: true },
        _count: { _all: true },
      }),
    ])

    type Row = {
      currency: string | null
      personId: string | null
      _sum: { amount: number | null }
      _count: { _all: number }
    }
    const toTotals = (destination: ExpenseDestination, rows: Row[]) =>
      rows.map((row) => ({
        destination,
        currency: row.currency ?? 'PEN',
        personId: row.personId ?? '',
        total: row._sum.amount ?? 0,
        count: row._count._all,
      }))

    return [
      ...toTotals(ExpenseDestination.DAILY, daily),
      ...toTotals(ExpenseDestination.FIXED_COST, fixedCosts),
      ...toTotals(ExpenseDestination.SUBSCRIPTION, subscriptions),
      ...toTotals(ExpenseDestination.CREDIT_CARD, creditCards),
      ...debts.map((row) => ({
        destination: row.direction === DebtDirection.I_OWE ? ExpenseDestination.PAYABLE : ExpenseDestination.RECEIVABLE,
        currency: row.currency,
        personId: row.personId,
        total: (row._sum.amount ?? 0) - (row._sum.paidAmount ?? 0),
        count: row._count._all,
      })),
    ]
  }

  // P21 reconciliation: card expenses bought (processDate) in a month, in soles
  async sumCardExpensesProcessedBetween(paymentMethodId: string, from: Date, to: Date): Promise<number> {
    const rows = await this.prisma.creditCardExpense.findMany({
      where: { paymentMethodId, processDate: { gte: from, lt: to } },
      select: { amount: true, amountInPen: true },
    })
    return Math.round(rows.reduce((sum, row) => sum + (row.amountInPen ?? row.amount), 0) * 100) / 100
  }

  private async deleteRowsOf(tx: Transaction, draftId: string) {
    const linked = { OR: [{ draftId }, { originDraftId: draftId }] }
    const paid = await tx.debtPayment.count({ where: { debt: linked } })
    if (paid) throw new SavedExpenseLockedException({ draftId })

    await tx.debt.deleteMany({ where: linked })
    await tx.creditCardExpense.deleteMany({ where: linked })
    await tx.dailyExpense.deleteMany({ where: { draftId } })
    await tx.fixedCost.deleteMany({ where: { draftId } })
    await tx.subscription.deleteMany({ where: { draftId } })
    await tx.expenseDraft.update({
      where: { id: draftId },
      data: { status: ExpenseDraftStatus.DISCARDED, pendingField: null },
    })
  }

  private async createRecord(tx: Transaction, draftId: string, input: SaveExpenseDbDto) {
    const { destination, data } = input
    switch (destination) {
      case ExpenseDestination.DAILY:
        return tx.dailyExpense.create({ data: { ...data, draftId } })
      case ExpenseDestination.FIXED_COST:
        return tx.fixedCost.create({ data: { ...data, draftId } })
      case ExpenseDestination.SUBSCRIPTION:
        return tx.subscription.create({ data: { ...data, draftId } })
      case ExpenseDestination.CREDIT_CARD: {
        const expense = await tx.creditCardExpense.create({ data: { ...data, draftId } })
        if (input.nextInstallments.length) await tx.creditCardExpense.createMany({ data: input.nextInstallments })
        return expense
      }
      case ExpenseDestination.RECEIVABLE:
      case ExpenseDestination.PAYABLE: {
        const debt = await tx.debt.create({ data: { ...data, draftId } })
        if ('nextInstallments' in input && input.nextInstallments.length) {
          await tx.debt.createMany({ data: input.nextInstallments })
        }
        return debt
      }
    }
  }
}
