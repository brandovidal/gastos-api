import { Injectable } from '@nestjs/common'

import { PrismaErrorCode } from '@/commons/constants/database.constant'
import { IncomeNotFoundException } from '@/commons/exceptions/budget/income-not-found.exception'
import { isPrismaError } from '@/commons/helpers/prisma-error.helper'
import { Income } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'

export interface IncomeWriteDbDto {
  description: string
  amount: number
  currency?: string
  receivedAt: Date
  month: number
  year: number
  notes?: string | null
}

// Extra incomes of a month (P19, D65); the salary lives in bud_monthly_budgets
@Injectable()
export class IncomeDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByMonth(month: number, year: number): Promise<Income[]> {
    return this.prisma.income.findMany({ where: { month, year }, orderBy: { receivedAt: 'asc' } })
  }

  create(data: IncomeWriteDbDto): Promise<Income> {
    return this.prisma.income.create({ data })
  }

  async update(id: string, data: Partial<IncomeWriteDbDto>): Promise<Income> {
    try {
      return await this.prisma.income.update({ where: { id }, data })
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new IncomeNotFoundException({ id })
      throw error
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.income.delete({ where: { id } })
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new IncomeNotFoundException({ id })
      throw error
    }
  }
}
