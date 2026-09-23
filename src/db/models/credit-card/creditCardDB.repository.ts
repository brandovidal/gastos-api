import { Injectable } from '@nestjs/common'

import { CreditCard } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'

@Injectable()
export class CreditCardDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Catalog injected into the AI prompt
  async findAll(): Promise<CreditCard[]> {
    return this.prisma.creditCard.findMany({ orderBy: { code: 'asc' } })
  }

  async findById(id: string): Promise<CreditCard | null> {
    return this.prisma.creditCard.findUnique({ where: { id } })
  }
}
