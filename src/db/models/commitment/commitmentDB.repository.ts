import { Injectable } from '@nestjs/common'

import { Commitment, Contribution, FixedCost } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'
import { PrismaErrorCode } from '@/commons/constants/database.constant'
import { CommitmentNotFoundException } from '@/commons/exceptions/commitment/commitment-not-found.exception'
import { ContributionNotFoundException } from '@/commons/exceptions/commitment/contribution-not-found.exception'
import { isPrismaError } from '@/commons/helpers/prisma-error.helper'

import { toCatalogError } from '../catalog-error.helper'

export type CommitmentWriteDbDto = Omit<Commitment, 'id' | 'createdAt' | 'updatedAt' | 'userId'>
export type ContributionWriteDbDto = Omit<Contribution, 'id' | 'createdAt' | 'updatedAt' | 'userId'>
export type InstallmentCreateDbDto = Omit<
  FixedCost,
  'id' | 'createdAt' | 'updatedAt' | 'userId' | 'draftId' | 'importKey' | 'othersShare' | 'exchangeRate' | 'amountInPen'
> &
  Partial<Pick<FixedCost, 'amountInPen'>>

export type CommitmentWithInstallments = Commitment & { installments: FixedCost[] }

const WITH_INSTALLMENTS = {
  installments: { orderBy: [{ paymentYear: 'asc' as const }, { paymentMonth: 'asc' as const }] },
}

// Loans and investments (P27, D99): the installments are fixed costs linked by commitmentId
@Injectable()
export class CommitmentDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(filter: { kind?: string; status?: string } = {}): Promise<CommitmentWithInstallments[]> {
    return this.prisma.commitment.findMany({
      where: filter,
      include: WITH_INSTALLMENTS,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    })
  }

  async findById(id: string): Promise<CommitmentWithInstallments> {
    const row = await this.prisma.commitment.findUnique({ where: { id }, include: WITH_INSTALLMENTS })
    if (!row) throw new CommitmentNotFoundException({ id })
    return row
  }

  findByName(name: string): Promise<Commitment | null> {
    return this.prisma.commitment.findFirst({ where: { name } })
  }

  // The commitment and, when it has a plan, its installments, in one transaction
  async create(data: CommitmentWriteDbDto, installments: Omit<InstallmentCreateDbDto, 'commitmentId'>[] = []) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const commitment = await tx.commitment.create({ data })
        if (installments.length) {
          await tx.fixedCost.createMany({
            data: installments.map((installment) => ({ ...installment, commitmentId: commitment.id }) as never),
          })
        }
        return commitment
      })
    } catch (error) {
      throw toCatalogError(error, 'commitment')
    }
  }

  async update(id: string, data: Partial<CommitmentWriteDbDto>): Promise<Commitment> {
    try {
      return await this.prisma.commitment.update({ where: { id }, data })
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new CommitmentNotFoundException({ id })
      throw toCatalogError(error, 'commitment', id)
    }
  }

  // Its installments stay as fixed costs (nothing is lost); contributions go with it (cascade)
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.fixedCost.updateMany({ where: { commitmentId: id }, data: { commitmentId: null } }),
        this.prisma.commitment.delete({ where: { id } }),
      ])
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new CommitmentNotFoundException({ id })
      throw error
    }
  }

  async addInstallments(id: string, rows: Omit<InstallmentCreateDbDto, 'commitmentId'>[]): Promise<number> {
    if (!rows.length) return 0
    const { count } = await this.prisma.fixedCost.createMany({
      data: rows.map((row) => ({ ...row, commitmentId: id }) as never),
    })
    return count
  }

  // ==================== Contributions ====================

  findContributions(commitmentId: string): Promise<Contribution[]> {
    return this.prisma.contribution.findMany({
      where: { commitmentId },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async findContribution(id: string): Promise<Contribution> {
    const row = await this.prisma.contribution.findUnique({ where: { id } })
    if (!row) throw new ContributionNotFoundException({ id })
    return row
  }

  createContribution(data: ContributionWriteDbDto): Promise<Contribution> {
    return this.prisma.contribution.create({ data })
  }

  async updateContribution(id: string, data: Partial<ContributionWriteDbDto>): Promise<Contribution> {
    try {
      return await this.prisma.contribution.update({ where: { id }, data })
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new ContributionNotFoundException({ id })
      throw error
    }
  }

  async deleteContribution(id: string): Promise<void> {
    try {
      await this.prisma.contribution.delete({ where: { id } })
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new ContributionNotFoundException({ id })
      throw error
    }
  }

  // What was put into each investment: total per commitment and currency
  async sumContributions(commitmentIds: string[]) {
    if (!commitmentIds.length) return []
    return this.prisma.contribution.groupBy({
      by: ['commitmentId', 'currency'],
      where: { commitmentId: { in: commitmentIds } },
      _sum: { amount: true, quantity: true },
      _count: { _all: true },
    })
  }
}
