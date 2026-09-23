import { Injectable } from '@nestjs/common'

import { MonthlyBudget } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'

export interface MonthlyBudgetWriteDbDto {
  month: number
  year: number
  salary: number
  limitPercent?: number
}

// Sueldo and spending limit of each month (Notion "Resumen"); P19 replaces the salary with real incomes
@Injectable()
export class MonthlyBudgetDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByMonth(month: number, year: number): Promise<MonthlyBudget | null> {
    return this.prisma.monthlyBudget.findUnique({ where: { month_year: { month, year } } })
  }

  upsert({ month, year, salary, limitPercent }: MonthlyBudgetWriteDbDto): Promise<MonthlyBudget> {
    return this.prisma.monthlyBudget.upsert({
      where: { month_year: { month, year } },
      create: { month, year, salary, limitPercent },
      update: { salary, limitPercent },
    })
  }
}
