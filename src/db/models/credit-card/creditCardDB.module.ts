import { Module } from '@nestjs/common'

import { CreditCardDBRepository } from './creditCardDB.repository'

@Module({
  providers: [CreditCardDBRepository],
  exports: [CreditCardDBRepository],
})
export class CreditCardDBModule {}
