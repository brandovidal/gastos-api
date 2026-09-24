import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Request } from 'express'
import { Observable, tap } from 'rxjs'

import { NotificationQueue } from './notification-queue.service'

const CHANGES = ['POST', 'PUT', 'PATCH', 'DELETE']

// Any change through the API (web edits, bot buttons, messages) may move a due date or pay something: the list of
// upcoming reminders in Redis is rebuilt once, 30 s after the last change (P20, D87)
@Injectable()
export class UpcomingRefreshInterceptor implements NestInterceptor {
  constructor(private readonly notificationQueue: NotificationQueue) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>()
    if (!CHANGES.includes(request.method) || request.path?.includes('/notifications')) return next.handle()
    return next.handle().pipe(tap(() => this.notificationQueue.requestRefresh()))
  }
}
