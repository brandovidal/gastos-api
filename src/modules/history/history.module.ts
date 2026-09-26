import { Module } from '@nestjs/common'

import { AuditChangeDBModule } from '@/db/models/audit/auditChangeDB.module'

import { HistoryController } from './history.controller'
import { HistoryService } from './history.service'

@Module({
  imports: [AuditChangeDBModule],
  controllers: [HistoryController],
  providers: [HistoryService],
})
export class HistoryModule {}
