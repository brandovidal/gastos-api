import { Module } from '@nestjs/common'

import { AuditChangeDBRepository } from './auditChangeDB.repository'

@Module({
  providers: [AuditChangeDBRepository],
  exports: [AuditChangeDBRepository],
})
export class AuditChangeDBModule {}
