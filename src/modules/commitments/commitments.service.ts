import { Injectable } from '@nestjs/common'

import { AttachmentRefType, CommitmentStatus } from '@/commons/constants/commitment.constant'
import { Currency, ExpenseType, PaymentStatus } from '@/commons/constants/expense.constant'
import { ContributionNotFoundException } from '@/commons/exceptions/commitment/contribution-not-found.exception'
import { CommitmentPlanIncompleteException } from '@/commons/exceptions/commitment/commitment-plan-incomplete.exception'
import {
  InstallmentPlan,
  installmentNumber,
  plannedInstallments,
  progressOf,
} from '@/commons/helpers/commitment.helper'
import { Commitment, Contribution, FixedCost } from '@/generated/prisma/client'
import {
  CommitmentDBRepository,
  CommitmentWithInstallments,
  InstallmentCreateDbDto,
} from '@/db/models/commitment/commitmentDB.repository'
import { PersonDBRepository } from '@/db/models/person/personDB.repository'
import { AttachmentsService } from '@/modules/attachments/attachments.service'

import {
  CommitmentListQueryDto,
  ContributionDto,
  CreateCommitmentDto,
  UpdateCommitmentDto,
  UpdateContributionDto,
} from './dto/request/commitments.dto'

const PLAN_FIELDS = ['installmentCount', 'installmentAmount', 'dueDay', 'startMonth', 'startYear'] as const
const round2 = (value: number) => Math.round(value * 100) / 100
const todayIso = () => new Date().toISOString().slice(0, 10)

// Préstamos e inversiones (P27, D99): the installments are fixed costs linked by commitmentId, so they already count
// in the month, the budget and the calendar; here they only get a plan, a progress and their files
@Injectable()
export class CommitmentsService {
  constructor(
    private readonly commitmentDBRepository: CommitmentDBRepository,
    private readonly personDBRepository: PersonDBRepository,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  async list(query: CommitmentListQueryDto) {
    const rows = await this.commitmentDBRepository.findMany(query)
    const ids = rows.map((row) => row.id)
    const [attachments, contributed] = await Promise.all([
      this.attachmentsService.counts(AttachmentRefType.COMMITMENT, ids),
      this.contributedOf(ids),
    ])
    return rows.map((row) => this.toView(row, attachments.get(row.id) ?? 0, contributed.get(row.id)))
  }

  async get(id: string) {
    const row = await this.commitmentDBRepository.findById(id)
    const contributions = await this.commitmentDBRepository.findContributions(id)
    const [attachments, installmentFiles, contributionFiles] = await Promise.all([
      this.attachmentsService.counts(AttachmentRefType.COMMITMENT, [id]),
      this.attachmentsService.counts(
        AttachmentRefType.FIXED_COST,
        row.installments.map((installment) => installment.id),
      ),
      this.attachmentsService.counts(
        AttachmentRefType.CONTRIBUTION,
        contributions.map((contribution) => contribution.id),
      ),
    ])
    const total = contributions.reduce((sum, contribution) => sum + contribution.amount, 0)

    return {
      ...this.toView(row, attachments.get(id) ?? 0, { amount: total, count: contributions.length }),
      installments: row.installments.map((installment) => ({
        id: installment.id,
        installment: installment.installment,
        paymentMonth: installment.paymentMonth,
        paymentYear: installment.paymentYear,
        dueDate: installment.dueDate,
        paymentDate: installment.paymentDate,
        amount: installment.amount,
        paymentStatus: installment.paymentStatus as PaymentStatus,
        attachmentCount: installmentFiles.get(installment.id) ?? 0,
      })),
      contributions: contributions.map((contribution) => ({
        ...contribution,
        attachmentCount: contributionFiles.get(contribution.id) ?? 0,
      })),
    }
  }

  async create(body: CreateCommitmentDto) {
    const { createInstallments, ...fields } = body
    const personId = fields.personId ?? (await this.personDBRepository.findDefault())?.id
    if (!personId) throw new CommitmentPlanIncompleteException({ missing: ['personId'] })

    const plan = this.planOf(fields)
    const wanted = createInstallments ?? plan !== null
    if (wanted) this.assertCanGenerate(fields, plan)

    const currency = fields.currency ?? Currency.PEN
    const rows =
      wanted && plan
        ? this.installmentRows(
            { ...fields, personId, currency, categoryId: fields.categoryId ?? null },
            plan,
            new Set(),
          )
        : []
    const totalAmount = fields.totalAmount ?? (plan ? round2(plan.installmentCount * plan.installmentAmount) : null)

    const created = await this.commitmentDBRepository.create(
      {
        name: fields.name,
        kind: fields.kind,
        subtype: fields.subtype,
        entity: fields.entity ?? null,
        currency,
        totalAmount,
        installmentCount: fields.installmentCount ?? null,
        installmentAmount: fields.installmentAmount ?? null,
        dueDay: fields.dueDay ?? null,
        startMonth: fields.startMonth ?? null,
        startYear: fields.startYear ?? null,
        cancellationAmount: fields.cancellationAmount ?? null,
        cancellationDate: fields.cancellationDate ?? null,
        status: CommitmentStatus.ACTIVE,
        personId,
        categoryId: fields.categoryId ?? null,
        notes: fields.notes ?? null,
      },
      rows,
    )
    return this.get(created.id)
  }

  // Editing the plan does not touch the installments that already exist (they are fixed costs, edited there)
  async update(id: string, body: UpdateCommitmentDto) {
    await this.commitmentDBRepository.update(id, body)
    return this.get(id)
  }

  async delete(id: string): Promise<void> {
    const contributions = await this.commitmentDBRepository.findContributions(id)
    await this.commitmentDBRepository.delete(id)
    await this.attachmentsService.removeOf([AttachmentRefType.COMMITMENT], id)
    for (const contribution of contributions) {
      await this.attachmentsService.removeOf([AttachmentRefType.CONTRIBUTION], contribution.id)
    }
  }

  // The installments the plan says and no fixed cost has yet (by number)
  async createMissingInstallments(id: string): Promise<{ created: number }> {
    const commitment = await this.commitmentDBRepository.findById(id)
    const plan = this.planOf(commitment)
    this.assertCanGenerate(commitment, plan)

    const existing = new Set(
      commitment.installments.map((row) => installmentNumber(row.installment)).filter((n): n is number => n !== null),
    )
    const rows = this.installmentRows(commitment, plan!, existing)
    return { created: await this.commitmentDBRepository.addInstallments(id, rows) }
  }

  // ==================== Contributions ====================

  async addContribution(id: string, body: ContributionDto) {
    const commitment = await this.commitmentDBRepository.findById(id)
    const created = await this.commitmentDBRepository.createContribution({
      commitmentId: id,
      date: body.date,
      amount: body.amount,
      currency: body.currency ?? commitment.currency,
      quantity: body.quantity ?? null,
      unit: body.unit ?? null,
      notes: body.notes ?? null,
    })
    return this.contributionView(created)
  }

  async updateContribution(id: string, contributionId: string, body: UpdateContributionDto) {
    await this.ownContribution(id, contributionId)
    return this.contributionView(await this.commitmentDBRepository.updateContribution(contributionId, body))
  }

  async deleteContribution(id: string, contributionId: string): Promise<void> {
    await this.ownContribution(id, contributionId)
    await this.commitmentDBRepository.deleteContribution(contributionId)
    await this.attachmentsService.removeOf([AttachmentRefType.CONTRIBUTION], contributionId)
  }

  // ==================== helpers ====================

  private async ownContribution(id: string, contributionId: string): Promise<Contribution> {
    const contribution = await this.commitmentDBRepository.findContribution(contributionId)
    if (contribution.commitmentId !== id) throw new ContributionNotFoundException({ id: contributionId })
    return contribution
  }

  private async contributionView(contribution: Contribution) {
    const counts = await this.attachmentsService.counts(AttachmentRefType.CONTRIBUTION, [contribution.id])
    return { ...contribution, attachmentCount: counts.get(contribution.id) ?? 0 }
  }

  private async contributedOf(ids: string[]) {
    const rows = await this.commitmentDBRepository.sumContributions(ids)
    const byId = new Map<string, { amount: number; count: number }>()
    for (const row of rows) {
      const current = byId.get(row.commitmentId) ?? { amount: 0, count: 0 }
      byId.set(row.commitmentId, {
        amount: current.amount + (row._sum.amount ?? 0),
        count: current.count + row._count._all,
      })
    }
    return byId
  }

  private planOf(
    fields: Partial<Record<(typeof PLAN_FIELDS)[number], number | null | undefined>>,
  ): InstallmentPlan | null {
    const { installmentCount, installmentAmount, dueDay, startMonth, startYear } = fields
    if (!installmentCount || !installmentAmount || !dueDay || !startMonth || !startYear) return null
    return { installmentCount, installmentAmount, dueDay, startMonth, startYear }
  }

  private assertCanGenerate(
    fields: Partial<Record<(typeof PLAN_FIELDS)[number], number | null | undefined>> & {
      categoryId?: string | null
    },
    plan: InstallmentPlan | null,
  ): void {
    const missing: string[] = plan ? [] : PLAN_FIELDS.filter((key) => !fields[key])
    if (!fields.categoryId) missing.push('categoryId')
    if (missing.length) throw new CommitmentPlanIncompleteException({ missing })
  }

  private installmentRows(
    commitment: Pick<Commitment, 'name' | 'currency' | 'personId' | 'categoryId'>,
    plan: InstallmentPlan,
    skip: Set<number>,
  ): Omit<InstallmentCreateDbDto, 'commitmentId'>[] {
    return plannedInstallments(plan)
      .filter((installment) => !skip.has(installment.number))
      .map((installment) => ({
        description: commitment.name,
        amount: installment.amount,
        amountInPen: commitment.currency === Currency.PEN ? installment.amount : null,
        currency: commitment.currency,
        expenseType: ExpenseType.ESSENTIAL,
        paymentStatus: PaymentStatus.NOT_STARTED,
        personId: commitment.personId,
        categoryId: commitment.categoryId!,
        paymentMethodId: null,
        installment: installment.installment,
        paymentMonth: installment.paymentMonth,
        paymentYear: installment.paymentYear,
        paymentDate: null,
        dueDate: new Date(`${installment.dueDate}T00:00:00.000Z`),
        attentionDate: null,
        notes: null,
      }))
  }

  private toView(
    row: CommitmentWithInstallments,
    attachmentCount: number,
    contributed?: { amount: number; count: number },
  ) {
    const { installments, ...commitment } = row
    const progress = row.installmentCount
      ? progressOf(row.installmentCount, installments.map(installmentRow), todayIso())
      : null
    const done = progress !== null && progress.paidCount >= progress.installmentCount
    return {
      ...commitment,
      status: commitment.status === CommitmentStatus.ACTIVE && done ? CommitmentStatus.PAID : commitment.status,
      progress,
      contributionCount: contributed?.count ?? 0,
      contributedAmount: round2(contributed?.amount ?? 0),
      attachmentCount,
    }
  }
}

const installmentRow = (row: FixedCost) => ({
  installment: row.installment,
  amount: row.amount,
  paymentStatus: row.paymentStatus,
  dueDate: row.dueDate,
  paymentMonth: row.paymentMonth,
  paymentYear: row.paymentYear,
})
