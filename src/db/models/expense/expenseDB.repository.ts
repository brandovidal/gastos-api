import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'
import { ExpenseDestination, ReceivableStatus } from '@/commons/constants/expense.constant'
import { ExpenseFileStatus } from '@/commons/constants/expense-file.constant'

import { MonthlyTotalDbDto, SaveExpenseDbDto } from './expenseDB.dto'

type Transaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0]

@Injectable()
export class ExpenseDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Creates the expense and marks its ExpenseFile as saved in one transaction
  async saveFromExpenseFile(expenseFileId: string, input: SaveExpenseDbDto): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const record = await this.createRecord(tx, expenseFileId, input)

      await tx.expenseFile.update({
        where: { id: expenseFileId },
        data: { status: ExpenseFileStatus.SAVED, pendingField: null, confirmedAt: new Date() },
      })

      return { id: record.id }
    })
  }

  // Totals of the month per destination, currency and person (receivables: everything not paid yet)
  async findMonthlyTotals(month: number, year: number): Promise<MonthlyTotalDbDto[]> {
    const where = { paymentMonth: month, paymentYear: year }
    const by: ['currency', 'personId'] = ['currency', 'personId']
    const aggregate = { _sum: { amount: true }, _count: { _all: true } } as const

    const [fixedCosts, subscriptions, creditCards, receivables] = await Promise.all([
      this.prisma.fixedCost.groupBy({ by, where, ...aggregate }),
      this.prisma.subscription.groupBy({ by, where, ...aggregate }),
      this.prisma.creditCardExpense.groupBy({ by, where, ...aggregate }),
      this.prisma.accountReceivable.groupBy({ by, where: { status: { not: ReceivableStatus.PAID } }, ...aggregate }),
    ])

    const toTotals = (destination: ExpenseDestination, rows: typeof fixedCosts) =>
      rows.map((row) => ({
        destination,
        currency: row.currency,
        personId: row.personId,
        total: row._sum.amount ?? 0,
        count: row._count._all,
      }))

    return [
      ...toTotals(ExpenseDestination.FIXED_COST, fixedCosts),
      ...toTotals(ExpenseDestination.SUBSCRIPTION, subscriptions),
      ...toTotals(ExpenseDestination.CREDIT_CARD, creditCards),
      ...toTotals(ExpenseDestination.RECEIVABLE, receivables),
    ]
  }

  private createRecord(tx: Transaction, expenseFileId: string, { destination, data }: SaveExpenseDbDto) {
    switch (destination) {
      case ExpenseDestination.FIXED_COST:
        return tx.fixedCost.create({ data: { ...data, expenseFileId } })
      case ExpenseDestination.SUBSCRIPTION:
        return tx.subscription.create({ data: { ...data, expenseFileId } })
      case ExpenseDestination.CREDIT_CARD:
        return tx.creditCardExpense.create({ data: { ...data, expenseFileId } })
      case ExpenseDestination.RECEIVABLE:
        return tx.accountReceivable.create({ data: { ...data, expenseFileId } })
    }
  }
}
