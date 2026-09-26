import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { Request } from 'express'
import { Observable } from 'rxjs'

import { AuditSource } from '@/commons/constants/audit.constant'
import { PrismaService } from '@/db/prisma/prisma.service'

import { setAuditContext } from './audit-context'

const CHANGES = ['POST', 'PUT', 'PATCH', 'DELETE']
// Telegram sets `bot` itself when it processes the update, after answering the webhook
const OWN_SOURCE_PATHS = ['/telegram/webhook']

@Injectable()
export class AuditContextService {
  private readonly logger = new Logger(AuditContextService.name)

  constructor(private readonly prisma: PrismaService) {}

  // Never blocks the work: a history without its source is better than a failed request
  async enter(source: AuditSource, options: { batchId?: string; actorId?: string } = {}): Promise<void> {
    try {
      await setAuditContext(this.prisma, source, options)
    } catch (error) {
      this.logger.warn(`[enter] ${source}: ${(error as Error).message}`)
    }
  }
}

// Every change through the API is `web` (kogane-app; the bot and the jobs set theirs; an import sets its own inside)
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  constructor(private readonly auditContext: AuditContextService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request & { actorId?: string }>()
    if (CHANGES.includes(request.method) && !OWN_SOURCE_PATHS.some((path) => request.path?.endsWith(path))) {
      await this.auditContext.enter(AuditSource.WEB, { actorId: request.actorId })
    }
    return next.handle()
  }
}
