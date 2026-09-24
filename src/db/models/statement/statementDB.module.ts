import { Module } from '@nestjs/common'

import { StatementDBRepository } from './statementDB.repository'

@Module({
  providers: [StatementDBRepository],
  exports: [StatementDBRepository],
})
export class StatementDBModule {}
