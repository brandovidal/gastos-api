import { Global, Module } from '@nestjs/common'

import { NotificationQueue } from './notification-queue.service'

// Global: modules that change expenses or debts only need NotificationQueue.requestRefresh (no cycle with the
// notifications module, which reads those modules)
@Global()
@Module({
  providers: [NotificationQueue],
  exports: [NotificationQueue],
})
export class NotificationQueueModule {}
