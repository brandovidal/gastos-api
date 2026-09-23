import { Module } from '@nestjs/common'

import { PaymentMethodDBRepository } from './paymentMethodDB.repository'
import { PaymentMethodDBSerializer } from './paymentMethodDB.serializer'

@Module({
  providers: [PaymentMethodDBRepository, PaymentMethodDBSerializer],
  exports: [PaymentMethodDBRepository, PaymentMethodDBSerializer],
})
export class PaymentMethodDBModule {}
