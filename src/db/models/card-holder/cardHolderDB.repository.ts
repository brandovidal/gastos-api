import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'
import { JsonHelper } from '@/commons/helpers/json.helper'

import { toCatalogError } from '../catalog-error.helper'

export interface CardHolderWriteDbDto {
  personId: string
  role: string // CardHolderRole
  last4?: string | null
}

export interface CardHolderDbDto extends CardHolderWriteDbDto {
  id: string
  last4: string | null
  paymentMethodId: string
  person: { id: string; name: string; aliases: string[] }
}

// Titular and additional people of each credit card (D116)
@Injectable()
export class CardHolderDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCard(paymentMethodId: string): Promise<CardHolderDbDto[]> {
    const rows = await this.prisma.cardHolder.findMany({
      where: { paymentMethodId },
      include: { person: { select: { id: true, name: true, aliases: true } } },
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }], // titular first
    })
    return rows.map(({ createdAt: _createdAt, person, ...row }) => ({
      ...row,
      person: { ...person, aliases: JsonHelper.parseArray<string>(person.aliases) },
    }))
  }

  // The whole list of a card at once (the dialog of Configuración ▸ Cuentas y tarjetas saves it like that)
  async replace(paymentMethodId: string, holders: CardHolderWriteDbDto[]): Promise<CardHolderDbDto[]> {
    try {
      await this.prisma.$transaction([
        this.prisma.cardHolder.deleteMany({ where: { paymentMethodId } }),
        this.prisma.cardHolder.createMany({
          data: holders.map((holder) => ({ ...holder, last4: holder.last4 || null, paymentMethodId })),
        }),
      ])
    } catch (error) {
      throw toCatalogError(error, 'cardHolders')
    }
    return this.findByCard(paymentMethodId)
  }
}
