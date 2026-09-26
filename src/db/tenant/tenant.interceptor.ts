import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'

import { tenantStorage } from './tenant-context'

// The signed-in user (SessionGuard put it on the request) becomes the tenant context of the whole handler: every query
// of a table with a userId is theirs alone (P23, D82)
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest<{ user?: { id: string } }>().user
    if (!user) return next.handle()
    return new Observable((subscriber) =>
      tenantStorage.run({ userId: user.id }, () => next.handle().subscribe(subscriber)),
    )
  }
}
