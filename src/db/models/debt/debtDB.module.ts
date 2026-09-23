import { Module } from '@nestjs/common'

import { DebtDBRepository } from './debtDB.repository'

@Module({
  providers: [DebtDBRepository],
  exports: [DebtDBRepository],
})
export class DebtDBModule {}
