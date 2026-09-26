import { Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'

import { AuditContextInterceptor, AuditContextService } from './audit-context.service'

// The bot and the jobs set their source through AuditContextService (P29): they import this module
@Module({
  providers: [AuditContextService, { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor }],
  exports: [AuditContextService],
})
export class AuditModule {}
