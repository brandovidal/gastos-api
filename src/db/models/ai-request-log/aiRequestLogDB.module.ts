import { Module } from '@nestjs/common'

import { AiRequestLogDBRepository } from './aiRequestLogDB.repository'

@Module({
  providers: [AiRequestLogDBRepository],
  exports: [AiRequestLogDBRepository],
})
export class AiRequestLogDBModule {}
