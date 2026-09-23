import { Injectable } from '@nestjs/common'

import { PaymentMethod } from '@/generated/prisma/client'
import { JsonHelper } from '@/commons/helpers/json.helper'

import { PaymentMethodDbDto } from './paymentMethodDB.dto'

@Injectable()
export class PaymentMethodDBSerializer {
  toDto(paymentMethod: PaymentMethod): PaymentMethodDbDto {
    return { ...paymentMethod, aliases: JsonHelper.parseArray(paymentMethod.aliases) }
  }

  toDtoArray(paymentMethods: PaymentMethod[]): PaymentMethodDbDto[] {
    return paymentMethods.map((paymentMethod) => this.toDto(paymentMethod))
  }
}
