import { Module } from '@nestjs/common'

import { CommitmentDBRepository } from './commitmentDB.repository'

@Module({
  providers: [CommitmentDBRepository],
  exports: [CommitmentDBRepository],
})
export class CommitmentDBModule {}
