import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'
import { PrismaErrorCode } from '@/commons/constants/database.constant'
import { isPrismaError } from '@/commons/helpers/prisma-error.helper'
import { ExpenseNotFoundException } from '@/commons/exceptions/expense/expense-not-found.exception'

import { toCatalogError } from '../catalog-error.helper'

// The expense tables kogane-app edits (P7). Each one has its own columns; the module validates them with Zod.
export enum ExpenseResource {
  DAILY = 'daily-expenses',
  FIXED_COST = 'fixed-costs',
  SUBSCRIPTION = 'subscriptions',
  CREDIT_CARD = 'credit-card-expenses',
  RECEIVABLE = 'receivables',
  RECURRING = 'recurring-expenses',
}

type Delegate = {
  findMany(args: unknown): Promise<unknown[]>
  findUnique(args: unknown): Promise<unknown>
  create(args: unknown): Promise<unknown>
  update(args: unknown): Promise<unknown>
  delete(args: unknown): Promise<unknown>
}

// How each table is filtered by month: by its payment month, by the spent date, or not at all
const PERIOD_FILTER: Record<ExpenseResource, 'payment' | 'spentAt' | 'none'> = {
  [ExpenseResource.DAILY]: 'spentAt',
  [ExpenseResource.FIXED_COST]: 'payment',
  [ExpenseResource.SUBSCRIPTION]: 'payment',
  [ExpenseResource.CREDIT_CARD]: 'payment',
  [ExpenseResource.RECEIVABLE]: 'none',
  [ExpenseResource.RECURRING]: 'none',
}

export interface ExpenseRecordFilter {
  month?: number
  year?: number
  personId?: string
  paymentMethodId?: string
}

@Injectable()
export class ExpenseRecordDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(resource: ExpenseResource, { month, year, personId, paymentMethodId }: ExpenseRecordFilter) {
    const where: Record<string, unknown> = {}
    if (personId) where.personId = personId
    if (paymentMethodId && resource !== ExpenseResource.RECEIVABLE) where.paymentMethodId = paymentMethodId

    if (month && year) {
      if (PERIOD_FILTER[resource] === 'payment') Object.assign(where, { paymentMonth: month, paymentYear: year })
      if (PERIOD_FILTER[resource] === 'spentAt') {
        where.spentAt = { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) }
      }
    }

    return this.delegate(resource).findMany({ where, orderBy: { createdAt: 'desc' } })
  }

  async findById(resource: ExpenseResource, id: string) {
    const record = await this.delegate(resource).findUnique({ where: { id } })
    if (!record) throw new ExpenseNotFoundException({ resource, id })
    return record
  }

  async create(resource: ExpenseResource, data: Record<string, unknown>) {
    try {
      return await this.delegate(resource).create({ data })
    } catch (error) {
      throw toCatalogError(error, resource)
    }
  }

  async update(resource: ExpenseResource, id: string, data: Record<string, unknown>) {
    try {
      return await this.delegate(resource).update({ where: { id }, data })
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new ExpenseNotFoundException({ resource, id })
      throw toCatalogError(error, resource, id)
    }
  }

  async delete(resource: ExpenseResource, id: string): Promise<void> {
    try {
      await this.delegate(resource).delete({ where: { id } })
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new ExpenseNotFoundException({ resource, id })
      throw error
    }
  }

  private delegate(resource: ExpenseResource): Delegate {
    const delegates: Record<ExpenseResource, unknown> = {
      [ExpenseResource.DAILY]: this.prisma.dailyExpense,
      [ExpenseResource.FIXED_COST]: this.prisma.fixedCost,
      [ExpenseResource.SUBSCRIPTION]: this.prisma.subscription,
      [ExpenseResource.CREDIT_CARD]: this.prisma.creditCardExpense,
      [ExpenseResource.RECEIVABLE]: this.prisma.accountReceivable,
      [ExpenseResource.RECURRING]: this.prisma.recurringExpense,
    }
    return delegates[resource] as Delegate
  }
}
