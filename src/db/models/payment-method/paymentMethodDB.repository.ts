import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'

import { PaymentMethodDbDto } from './paymentMethodDB.dto'
import { PaymentMethodDBSerializer } from './paymentMethodDB.serializer'

@Injectable()
export class PaymentMethodDBRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serializer: PaymentMethodDBSerializer,
  ) {}

  // Catalog injected into the AI prompt to resolve names and aliases
  async findActive(): Promise<PaymentMethodDbDto[]> {
    const paymentMethods = await this.prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
    return this.serializer.toDtoArray(paymentMethods)
  }
}
