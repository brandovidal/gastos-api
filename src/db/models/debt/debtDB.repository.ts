import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'
import { PrismaErrorCode } from '@/commons/constants/database.constant'
import { DEBT_PAYMENT_PROPOSAL_MINUTES, OPEN_DEBT_STATUSES } from '@/commons/constants/debt.constant'
import { debtStatusFor, PaymentAllocation } from '@/commons/helpers/debt.helper'
import { isPrismaError } from '@/commons/helpers/prisma-error.helper'
import { DebtNotFoundException } from '@/commons/exceptions/debt/debt-not-found.exception'
import { Debt, DebtPayment } from '@/generated/prisma/client'

import { toCatalogError } from '../catalog-error.helper'

import {
  CreateDebtDbDto,
  CreateDebtPaymentDbDto,
  DebtFilterDbDto,
  DebtPaymentProposalDbDto,
  DebtWithPersonDbDto,
  UpdateDebtDbDto,
} from './debtDB.dto'

type Transaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0]

const WITH_PERSON = { person: { select: { id: true, name: true } } } as const
// Oldest installment first: the order payments are applied in
const BY_PERIOD = [{ paymentYear: 'asc' }, { paymentMonth: 'asc' }, { createdAt: 'asc' }] as const

// exp_debts + exp_debt_payments (P17, D60). paidAmount and status are never written from outside: they follow the
// confirmed payments, recomputed in the same transaction as every payment change.
@Injectable()
export class DebtDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany({ personId, direction, statuses }: DebtFilterDbDto): Promise<DebtWithPersonDbDto[]> {
    return this.prisma.debt.findMany({
      where: { personId, direction, ...(statuses?.length ? { status: { in: statuses } } : {}) },
      include: WITH_PERSON,
      orderBy: [...BY_PERIOD],
    })
  }

  findOpen(filter: Omit<DebtFilterDbDto, 'statuses'> = {}): Promise<DebtWithPersonDbDto[]> {
    return this.findMany({ ...filter, statuses: OPEN_DEBT_STATUSES })
  }

  async findById(id: string): Promise<DebtWithPersonDbDto & { payments: DebtPayment[] }> {
    const debt = await this.prisma.debt.findUnique({
      where: { id },
      include: { ...WITH_PERSON, payments: { where: { confirmedAt: { not: null } }, orderBy: { paidAt: 'asc' } } },
    })
    if (!debt) throw new DebtNotFoundException({ id })
    return debt
  }

  // Every installment or none
  async createMany(rows: CreateDebtDbDto[]): Promise<Debt[]> {
    try {
      return await this.prisma.$transaction(rows.map((data) => this.prisma.debt.create({ data })))
    } catch (error) {
      throw toCatalogError(error, 'debts')
    }
  }

  async update(id: string, data: UpdateDebtDbDto): Promise<Debt> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.debt.update({ where: { id }, data })
        return this.recompute(tx, id)
      })
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new DebtNotFoundException({ id })
      throw toCatalogError(error, 'debts', id)
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.debt.delete({ where: { id } })
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new DebtNotFoundException({ id })
      throw error
    }
  }

  // A payment registered from the web: confirmed at once
  addPayment(data: CreateDebtPaymentDbDto): Promise<Debt> {
    return this.prisma.$transaction(async (tx) => {
      await tx.debtPayment.create({ data: { ...data, confirmedAt: new Date() } })
      return this.recompute(tx, data.debtId)
    })
  }

  async deletePayment(debtId: string, paymentId: string): Promise<Debt> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.debtPayment.deleteMany({ where: { id: paymentId, debtId } })
      if (!count) throw new DebtNotFoundException({ debtId, paymentId })
      return this.recompute(tx, debtId)
    })
  }

  // Bot: "dany me pagó 150" becomes unconfirmed payments grouped by batchId until ✅ Confirmar
  async replaceProposal(batchId: string, allocations: PaymentAllocation[], paidAt: Date, notes: string | null) {
    await this.prisma.$transaction([
      this.prisma.debtPayment.deleteMany({ where: { batchId, confirmedAt: null } }),
      this.prisma.debtPayment.createMany({
        data: allocations.map(({ debtId, amount }) => ({ debtId, amount, paidAt, batchId, notes })),
      }),
    ])
  }

  // Proposals expire like open drafts: an old button does nothing
  findProposal(batchId: string, now = new Date()): Promise<DebtPaymentProposalDbDto[]> {
    return this.prisma.debtPayment.findMany({
      where: {
        batchId,
        confirmedAt: null,
        createdAt: { gte: new Date(now.getTime() - DEBT_PAYMENT_PROPOSAL_MINUTES * 60_000) },
      },
      include: { debt: { include: WITH_PERSON } },
      orderBy: { createdAt: 'asc' },
    })
  }

  confirmProposal(batchId: string): Promise<Debt[]> {
    return this.prisma.$transaction(async (tx) => {
      const payments = await tx.debtPayment.findMany({ where: { batchId, confirmedAt: null } })
      await tx.debtPayment.updateMany({ where: { batchId, confirmedAt: null }, data: { confirmedAt: new Date() } })
      const debtIds = [...new Set(payments.map((payment) => payment.debtId))]
      return Promise.all(debtIds.map((debtId) => this.recompute(tx, debtId)))
    })
  }

  discardProposal(batchId: string) {
    return this.prisma.debtPayment.deleteMany({ where: { batchId, confirmedAt: null } })
  }

  // paidAmount = confirmed payments; status from debtStatusFor (D60)
  private async recompute(tx: Transaction, debtId: string): Promise<Debt> {
    const debt = await tx.debt.findUniqueOrThrow({ where: { id: debtId } })
    const { _sum, _max } = await tx.debtPayment.aggregate({
      where: { debtId, confirmedAt: { not: null } },
      _sum: { amount: true },
      _max: { paidAt: true },
    })
    const paidAmount = _sum.amount ?? 0
    const lastPaidAt = _max.paidAt ?? null
    const status = debtStatusFor({ ...debt, paidAmount }, lastPaidAt)

    return tx.debt.update({ where: { id: debtId }, data: { paidAmount, paidDate: lastPaidAt, status } })
  }
}
