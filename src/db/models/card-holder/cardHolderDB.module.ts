import { Module } from '@nestjs/common'

import { CardHolderDBRepository } from './cardHolderDB.repository'

@Module({
  providers: [CardHolderDBRepository],
  exports: [CardHolderDBRepository],
})
export class CardHolderDBModule {}
