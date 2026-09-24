import { Injectable } from '@nestjs/common'

import { MonthlyBudget } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'

export interface MonthlyBudgetWriteDbDto {
  month: number
  year: number
  salary: number
  limitPercent?: number
}

// Sueldo and spending limit of each month (Notion "Resumen"); extra incomes live in bud_incomes (P19, D65)
@Injectable()
export class MonthlyBudgetDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByMonth(month: number, year: number): Promise<MonthlyBudget | null> {
    return this.prisma.monthlyBudget.findUnique({ where: { month_year: { month, year } } })
  }

  // The latest month with a salary before the given one: a month without salary proposes it (P19)
  findLatestBefore(month: number, year: number): Promise<MonthlyBudget | null> {
    return this.prisma.monthlyBudget.findFirst({
      where: { OR: [{ year: { lt: year } }, { year, month: { lt: month } }] },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })
  }

  upsert({ month, year, salary, limitPercent }: MonthlyBudgetWriteDbDto): Promise<MonthlyBudget> {
    return this.prisma.monthlyBudget.upsert({
      where: { month_year: { month, year } },
      create: { month, year, salary, limitPercent },
      update: { salary, limitPercent },
    })
  }
}
