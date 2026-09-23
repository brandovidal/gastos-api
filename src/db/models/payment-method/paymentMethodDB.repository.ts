import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { JsonHelper } from '@/commons/helpers/json.helper'

import { PaymentMethodDbDto } from './paymentMethodDB.dto'
import { PaymentMethodDBSerializer } from './paymentMethodDB.serializer'

@Injectable()
export class PaymentMethodDBRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serializer: PaymentMethodDBSerializer,
  ) {}

  // Catalog injected into the AI prompt (all active methods; showInBot only filters the quick replies)
  async findActive(): Promise<PaymentMethodDbDto[]> {
    const paymentMethods = await this.prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
    return this.serializer.toDtoArray(paymentMethods)
  }

  async findById(id: string): Promise<PaymentMethodDbDto | null> {
    const paymentMethod = await this.prisma.paymentMethod.findUnique({ where: { id } })
    return paymentMethod ? this.serializer.toDto(paymentMethod) : null
  }

  // A payment method typed in the bot that did not exist yet
  async create(name: string, type: PaymentMethodType): Promise<PaymentMethodDbDto> {
    const paymentMethod = await this.prisma.paymentMethod.upsert({
      where: { name },
      create: { name, type, aliases: JsonHelper.stringify([name.toLowerCase()]), showInBot: true },
      update: { isActive: true },
    })
    return this.serializer.toDto(paymentMethod)
  }

  async updateBillingDays(id: string, billingCloseDay: number, paymentDueDay: number): Promise<PaymentMethodDbDto> {
    const paymentMethod = await this.prisma.paymentMethod.update({
      where: { id },
      data: { billingCloseDay, paymentDueDay },
    })
    return this.serializer.toDto(paymentMethod)
  }
}
