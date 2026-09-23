import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'
import { DebtDirection, OPEN_DEBT_STATUSES } from '@/commons/constants/debt.constant'
import { ExpenseDestination } from '@/commons/constants/expense.constant'
import { ExpenseDraftStatus } from '@/commons/constants/expense-draft.constant'

import { MonthlyTotalDbDto, SaveExpenseDbDto } from './expenseDB.dto'

type Transaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0]

@Injectable()
export class ExpenseDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Creates the expense and marks its ExpenseDraft as saved in one transaction
  async saveFromExpenseDraft(draftId: string, input: SaveExpenseDbDto): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const record = await this.createRecord(tx, draftId, input)

      await tx.expenseDraft.update({
        where: { id: draftId },
        data: { status: ExpenseDraftStatus.SAVED, pendingField: null, confirmedAt: new Date() },
      })

      return { id: record.id }
    })
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

  private async createRecord(tx: Transaction, draftId: string, input: SaveExpenseDbDto) {
    const { destination, data } = input
    switch (destination) {
      case ExpenseDestination.DAILY:
        return tx.dailyExpense.create({ data: { ...data, draftId } })
      case ExpenseDestination.FIXED_COST:
        return tx.fixedCost.create({ data: { ...data, draftId } })
      case ExpenseDestination.SUBSCRIPTION:
        return tx.subscription.create({ data: { ...data, draftId } })
      case ExpenseDestination.CREDIT_CARD:
        return tx.creditCardExpense.create({ data: { ...data, draftId } })
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
