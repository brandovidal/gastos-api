import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { Worker } from 'bullmq'

import { AuditSource } from '@/commons/constants/audit.constant'
import { AuditContextService } from '@/db/audit/audit-context.service'
import { DELIVER_QUEUE, NotificationJob, SCHEDULE_QUEUE } from '@/commons/constants/notification.constant'
import { RedisService } from '@/providers/redis/redis.service'

import { NotificationJobsService } from './notification-jobs.service'
import { DeliverJobData, NotificationQueue } from './notification-queue.service'
import { NotificationsService } from './notifications.service'

// Starts the BullMQ workers of P20 (D87) in the API process: one runs the scheduled jobs, one sends the notices to
// Telegram (5 attempts). Without Redis nothing starts and the jobs can still be run by hand (POST .../run/:job).
@Injectable()
export class NotificationWorkers implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(NotificationWorkers.name)
  private workers: Worker[] = []

  constructor(
    private readonly redisService: RedisService,
    private readonly notificationQueue: NotificationQueue,
    private readonly notificationJobsService: NotificationJobsService,
    private readonly notificationsService: NotificationsService,
    private readonly auditContext: AuditContextService,
  ) {}

  // Not awaited: Redis being slow or down never delays the start of the API
  onApplicationBootstrap() {
    if (!this.notificationQueue.isEnabled) return
    void this.start()
  }

  async beforeApplicationShutdown() {
    await Promise.all(this.workers.map((worker) => worker.close()))
  }

  private async start() {
    try {
      await this.notificationQueue.upsertSchedulers()
    } catch (error) {
      this.logger.error(`[start] schedules not saved: ${(error as Error).message}`)
    }

    const schedule = new Worker(
      SCHEDULE_QUEUE,
      async (job) => {
        await this.auditContext.enter(AuditSource.SCHEDULER) // recurring expenses, cleanups: the history says so (P29)
        return this.notificationJobsService.run(job.name as NotificationJob)
      },
      { connection: this.redisService.connection(), concurrency: 1 },
    )
    const deliveries = new Worker<DeliverJobData>(
      DELIVER_QUEUE,
      (job) => this.notificationsService.deliver(job.data.notificationId),
      { connection: this.redisService.connection(), concurrency: 1 },
    )
    for (const worker of [schedule, deliveries]) {
      worker.on('failed', (job, error) =>
        this.logger.error(
          `[${worker.name}] ${job?.name ?? 'job'} failed (attempt ${job?.attemptsMade}): ${error.message}`,
        ),
      )
      worker.on('error', (error) => this.logger.warn(`[${worker.name}] ${error.message}`))
    }
    this.workers = [schedule, deliveries]
    this.logger.log('[start] reminders scheduled')
  }
}
