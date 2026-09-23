import { Injectable } from '@nestjs/common'

import { BudgetGroup } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'

import { toCatalogError } from '../catalog-error.helper'

export interface BudgetGroupWriteDbDto {
  name: string
  emoji?: string
  percentage?: number
  order?: number
}

// Relación de gastos: groups of categories with the share of the income they may use
@Injectable()
export class BudgetGroupDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<BudgetGroup[]> {
    return this.prisma.budgetGroup.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }] })
  }

  async create(data: BudgetGroupWriteDbDto): Promise<BudgetGroup> {
    try {
      return await this.prisma.budgetGroup.create({ data })
    } catch (error) {
      throw toCatalogError(error, 'budgetGroup')
    }
  }

  async update(id: string, data: Partial<BudgetGroupWriteDbDto>): Promise<BudgetGroup> {
    try {
      return await this.prisma.budgetGroup.update({ where: { id }, data })
    } catch (error) {
      throw toCatalogError(error, 'budgetGroup', id)
    }
  }

  // Fails with CATALOG_ITEM_IN_USE while categories belong to it
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.budgetGroup.delete({ where: { id } })
    } catch (error) {
      throw toCatalogError(error, 'budgetGroup', id)
    }
  }
}
