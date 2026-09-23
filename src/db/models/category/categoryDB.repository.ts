import { Injectable } from '@nestjs/common'

import { Category } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'

@Injectable()
export class CategoryDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Catalog injected into the AI prompt
  async findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } })
  }
}
