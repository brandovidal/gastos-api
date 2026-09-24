import { Injectable } from '@nestjs/common'

import { PrismaErrorCode } from '@/commons/constants/database.constant'
import { CategoryBudgetNotFoundException } from '@/commons/exceptions/budget/category-budget-not-found.exception'
import { CatalogItemNotFoundException } from '@/commons/exceptions/catalog/catalog-item-not-found.exception'
import { isPrismaError } from '@/commons/helpers/prisma-error.helper'
import { CategoryBudget } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'

export interface CategoryBudgetWriteDbDto {
  categoryId: string
  monthlyLimit: number
  alertThreshold?: number
  month?: number | null // null: the limit of every month; with month and year it replaces it for that month
  year?: number | null
}

// Spending limit per category (P19): a row without month applies to every month, a row with month overrides it
@Injectable()
export class CategoryBudgetDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  // One limit per category: the one of the month when there is one, otherwise the general one
  async findEffective(month: number, year: number): Promise<CategoryBudget[]> {
    const rows = await this.prisma.categoryBudget.findMany({
      where: { OR: [{ month: null }, { month, year }] },
    })
    const byCategory = new Map<string, CategoryBudget>()
    for (const row of rows) {
      const current = byCategory.get(row.categoryId)
      if (!current || (current.month == null && row.month != null)) byCategory.set(row.categoryId, row)
    }
    return [...byCategory.values()]
  }

  // SQLite keeps NULLs distinct in unique indexes, so the general row (month null) is looked up by hand
  async upsert({ categoryId, monthlyLimit, alertThreshold, month = null, year = null }: CategoryBudgetWriteDbDto) {
    const scope = { categoryId, month: month ?? null, year: month == null ? null : year }
    try {
      const existing = await this.prisma.categoryBudget.findFirst({ where: scope })
      return existing
        ? await this.prisma.categoryBudget.update({
            where: { id: existing.id },
            data: { monthlyLimit, alertThreshold },
          })
        : await this.prisma.categoryBudget.create({ data: { ...scope, monthlyLimit, alertThreshold } })
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.FOREIGN_KEY_CONSTRAINT)) {
        throw new CatalogItemNotFoundException({ entity: 'category', id: categoryId })
      }
      throw error
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.categoryBudget.delete({ where: { id } })
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) throw new CategoryBudgetNotFoundException({ id })
      throw error
    }
  }
}
