import { Injectable } from '@nestjs/common'

import { Category } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'

import { toCatalogError } from '../catalog-error.helper'

export interface CategoryWriteDbDto {
  name: string
  color?: string
  icon?: string | null
  isDefault?: boolean
  budgetGroupId?: string | null
}

@Injectable()
export class CategoryDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Catalog injected into the AI prompt
  async findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } })
  }

  async create(data: CategoryWriteDbDto): Promise<Category> {
    try {
      return await this.prisma.category.create({ data })
    } catch (error) {
      throw toCatalogError(error, 'category')
    }
  }

  async update(id: string, data: Partial<CategoryWriteDbDto>): Promise<Category> {
    try {
      return await this.prisma.category.update({ where: { id }, data })
    } catch (error) {
      throw toCatalogError(error, 'category', id)
    }
  }

  // Fails with CATALOG_ITEM_IN_USE while expenses use it
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.category.delete({ where: { id } })
    } catch (error) {
      throw toCatalogError(error, 'category', id)
    }
  }
}
