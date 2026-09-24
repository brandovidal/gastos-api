import { Injectable } from '@nestjs/common'

import { Statement } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'
import { PaymentStatus } from '@/commons/constants/expense.constant'
import { StatementRowResult, StatementStatus } from '@/commons/constants/statement.constant'
import { StatementNotFoundException } from '@/commons/exceptions/statement/statement-not-found.exception'
import { PaymentPeriod } from '@/commons/helpers/payment-period.helper'

export interface CreateStatementDbDto {
  paymentMethodId: string
  paymentMonth: number
  paymentYear: number
  periodEnd: Date | null
  dueDate: Date | null
  totalDue: number | null
  minimumDue: number | null
  currency: string
  source: string
  fileId: string | null
  status: string
  rows: {
    date: Date | null
    description: string
    amount: number
    currency: string
    installment: string | null
    result: string
    expenseId: string | null
  }[]
}

const withRows = { rows: { orderBy: [{ date: 'asc' as const }, { createdAt: 'asc' as const }] } }

// Bank statements (P14 block 2, D95) and the card expenses they are reconciled with
@Injectable()
export class StatementDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  create({ rows, ...data }: CreateStatementDbDto) {
    return this.prisma.statement.create({ data: { ...data, rows: { create: rows } }, include: withRows })
  }

  async findById(id: string) {
    const statement = await this.prisma.statement.findUnique({ where: { id }, include: withRows })
    if (!statement) throw new StatementNotFoundException({ id })
    return statement
  }

  findMany() {
    return this.prisma.statement.findMany({
      orderBy: [{ paymentYear: 'desc' }, { paymentMonth: 'desc' }, { createdAt: 'desc' }],
      include: { rows: { select: { result: true } } },
    })
  }

  // The statements of those months (the calendar shows their real total and due date, P20)
  findForPeriods(periods: PaymentPeriod[]): Promise<Statement[]> {
    if (!periods.length) return Promise.resolve([])
    return this.prisma.statement.findMany({
      where: { OR: periods.map(({ paymentMonth, paymentYear }) => ({ paymentMonth, paymentYear })) },
      orderBy: { createdAt: 'desc' },
    })
  }

  async delete(id: string): Promise<void> {
    await this.findById(id)
    await this.prisma.statement.delete({ where: { id } })
  }

  // The card expenses of that statement month, to reconcile
  findCardExpenses(paymentMethodId: string, { paymentMonth, paymentYear }: PaymentPeriod) {
    return this.prisma.creditCardExpense.findMany({
      where: { paymentMethodId, paymentMonth, paymentYear, paymentStatus: { not: PaymentStatus.SKIPPED } },
      select: { id: true, description: true, amount: true, processDate: true, installment: true },
    })
  }

  // "Crear nuevos": each new row becomes a pending card expense of the statement month, in one transaction
  async createExpenses(statementId: string, rows: { id: string; data: Record<string, unknown> }[]): Promise<number> {
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const expense = await tx.creditCardExpense.create({ data: row.data as never, select: { id: true } })
        await tx.statementRow.update({
          where: { id: row.id },
          data: { result: StatementRowResult.CREATED, expenseId: expense.id },
        })
      }
      await this.refreshStatus(tx, statementId)
    })
    return rows.length
  }

  async setRowResult(statementId: string, rowId: string, result: StatementRowResult) {
    await this.prisma.$transaction(async (tx) => {
      await tx.statementRow.updateMany({ where: { id: rowId, statementId }, data: { result } })
      await this.refreshStatus(tx, statementId)
    })
    return this.findById(statementId)
  }

  // Done when no row is left new
  private async refreshStatus(tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0], statementId: string) {
    const pending = await tx.statementRow.count({ where: { statementId, result: StatementRowResult.NEW } })
    await tx.statement.update({
      where: { id: statementId },
      data: { status: pending ? StatementStatus.REVIEW : StatementStatus.DONE },
    })
  }
}
