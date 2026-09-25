import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'
import { PrismaErrorCode } from '@/commons/constants/database.constant'
import { ExpenseDraftStatus } from '@/commons/constants/expense-draft.constant'
import { RECURRING_KINDS, RecurringTargetType, SubscriptionKind } from '@/commons/constants/expense.constant'
import { convertRow, MovableTable, MoveTarget } from '@/commons/helpers/expense-move.helper'
import { isPrismaError } from '@/commons/helpers/prisma-error.helper'
import { ExpenseNotFoundException } from '@/commons/exceptions/expense/expense-not-found.exception'

import { toCatalogError } from '../catalog-error.helper'

// The expense tables kogane-app edits (P7). Each one has its own columns; the module validates them with Zod.
// Loans and debts have their own module (`/v1/debts`, P17).
export enum ExpenseResource {
  DAILY = 'daily-expenses',
  FIXED_COST = 'fixed-costs',
  SUBSCRIPTION = 'subscriptions',
  CREDIT_CARD = 'credit-card-expenses',
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
  [ExpenseResource.RECURRING]: 'none',
}

export interface ExpenseRecordFilter {
  month?: number
  year?: number
  personId?: string
  paymentMethodId?: string
  kind?: 'platform' | 'recurring' // subscriptions only: Plataformas or Recurrentes (D107)
}

export const MOVABLE_TABLE: Partial<Record<ExpenseResource, MovableTable>> = {
  [ExpenseResource.FIXED_COST]: 'fixedCost',
  [ExpenseResource.SUBSCRIPTION]: 'subscription',
}

export interface SeriesRow {
  id: string
  categoryId: string | null
  paymentMonth: number
  paymentYear: number
  draftId: string | null
}

export interface ExpenseSeries {
  rows: SeriesRow[]
  templates: number
  blockedIds: string[] // rows with an /editar copy open (D76): saving it would put them back in the old table
}

@Injectable()
export class ExpenseRecordDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(resource: ExpenseResource, { month, year, personId, paymentMethodId, kind }: ExpenseRecordFilter) {
    const where: Record<string, unknown> = {}
    if (personId) where.personId = personId
    if (paymentMethodId) where.paymentMethodId = paymentMethodId
    if (kind && resource === ExpenseResource.SUBSCRIPTION) {
      where.kind = kind === 'platform' ? SubscriptionKind.PLATFORM : { in: RECURRING_KINDS }
    }

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

  // Returns the file of the chat draft it came from (D58), so the caller can release it
  async delete(resource: ExpenseResource, id: string): Promise<{ fileId: string | null }> {
    // Recurring expenses are not created from drafts
    const include = resource === ExpenseResource.RECURRING ? undefined : { draft: { select: { fileId: true } } }
    try {
      const deleted = (await this.delegate(resource).delete({ where: { id }, include })) as {
        draft?: { fileId: string | null } | null
      }
      return { fileId: deleted.draft?.fileId ?? null }
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new ExpenseNotFoundException({ resource, id })
      throw error
    }
  }

  // The series of a row (D106): same table, description and person, oldest first, plus its recurring templates
  async findSeries(resource: ExpenseResource, id: string): Promise<ExpenseSeries> {
    const row = (await this.findById(resource, id)) as { description: string; personId: string }
    const series = { description: row.description, personId: row.personId }
    const rows = (await this.delegate(resource).findMany({
      where: series,
      select: { id: true, categoryId: true, paymentMonth: true, paymentYear: true, draftId: true },
      orderBy: [{ paymentYear: 'asc' }, { paymentMonth: 'asc' }],
    })) as SeriesRow[]
    const draftIds = rows.flatMap((candidate) => (candidate.draftId ? [candidate.draftId] : []))
    const [templates, editing] = await Promise.all([
      this.prisma.recurringExpense.count({ where: series }),
      draftIds.length
        ? this.prisma.expenseDraft.findMany({
            where: { status: ExpenseDraftStatus.EDITING, replacesDraftId: { in: draftIds } },
            select: { replacesDraftId: true },
          })
        : Promise.resolve([]),
    ])
    const editedDrafts = new Set(editing.map((draft) => draft.replacesDraftId))
    return {
      rows,
      templates,
      blockedIds: rows.filter((candidate) => candidate.draftId && editedDrafts.has(candidate.draftId)).map((r) => r.id),
    }
  }

  // Moves the rows to the other table (or changes their kind) in one transaction, keeping every id, draft, importKey,
  // share and date; the templates of the series now generate into the new place
  async moveSeries(resource: ExpenseResource, to: ExpenseResource, ids: string[], target: MoveTarget) {
    const from = MOVABLE_TABLE[resource]!
    const into = MOVABLE_TABLE[to]!
    const first = (await this.findById(resource, ids[0])) as { description: string; personId: string }
    const templateData =
      into === 'subscription'
        ? {
            targetType: RecurringTargetType.SUBSCRIPTION,
            kind: target.kind,
            ...(target.period ? { period: target.period } : {}),
          }
        : { targetType: RecurringTargetType.FIXED_COST }

    await this.prisma.$transaction(async (tx) => {
      const source = (from === 'fixedCost' ? tx.fixedCost : tx.subscription) as unknown as Delegate & {
        deleteMany(args: unknown): Promise<unknown>
        updateMany(args: unknown): Promise<unknown>
      }
      if (from === into) {
        await source.updateMany({ where: { id: { in: ids } }, data: { kind: target.kind } })
      } else {
        const rows = (await source.findMany({ where: { id: { in: ids } } })) as Record<string, unknown>[]
        await source.deleteMany({ where: { id: { in: ids } } })
        const data = rows.map((row) => convertRow(row, from, into, target))
        if (into === 'fixedCost') await tx.fixedCost.createMany({ data: data as never })
        else await tx.subscription.createMany({ data: data as never })
      }
      await tx.recurringExpense.updateMany({
        where: { description: first.description, personId: first.personId },
        data: templateData,
      })
    })
  }

  private delegate(resource: ExpenseResource): Delegate {
    const delegates: Record<ExpenseResource, unknown> = {
      [ExpenseResource.DAILY]: this.prisma.dailyExpense,
      [ExpenseResource.FIXED_COST]: this.prisma.fixedCost,
      [ExpenseResource.SUBSCRIPTION]: this.prisma.subscription,
      [ExpenseResource.CREDIT_CARD]: this.prisma.creditCardExpense,
      [ExpenseResource.RECURRING]: this.prisma.recurringExpense,
    }
    return delegates[resource] as Delegate
  }
}
