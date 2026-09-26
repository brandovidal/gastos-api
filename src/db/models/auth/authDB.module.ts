import { Module } from '@nestjs/common'

import { AuthDBRepository } from './authDB.repository'

@Module({
  providers: [AuthDBRepository],
  exports: [AuthDBRepository],
})
export class AuthDBModule {}
