import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { Worker } from 'bullmq'

import { AuditSource } from '@/commons/constants/audit.constant'
import { AuditContextService } from '@/db/audit/audit-context.service'
import { AuthDBRepository } from '@/db/models/auth/authDB.repository'
import { runAsSystem, runWithUser } from '@/db/tenant/tenant-context'
import { UserStatus } from '@/commons/constants/auth.constant'
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
    private readonly authDBRepository: AuthDBRepository,
  ) {}

  // Not awaited: Redis being slow or down never delays the start of the API
  onApplicationBootstrap() {
    if (!this.notificationQueue.isEnabled) return
    void this.start()
  }

  async beforeApplicationShutdown() {
    await Promise.all(this.workers.map((worker) => worker.close()))
  }

  // A job runs once per active user, each in their own tenant context (P23); the cleanup of expired files is of everyone
  private async runScheduled(job: NotificationJob): Promise<void> {
    if (job === NotificationJob.FILES_CLEANUP) {
      await runAsSystem(() => this.notificationJobsService.run(job))
      return
    }
    const users = (await runAsSystem(() => this.authDBRepository.listUsers())).filter(
      (user) => user.status === UserStatus.ACTIVE,
    )
    for (const user of users) {
      try {
        await runWithUser(user.id, async () => {
          await this.auditContext.enter(AuditSource.SCHEDULER, { actorId: user.id }) // the history says so (P29)
          await this.notificationJobsService.run(job)
        })
      } catch (error) {
        // One user's failure does not stop the others
        this.logger.error(`[runScheduled] ${job} for ${user.id}: ${(error as Error).message}`)
      }
    }
  }

  private async start() {
    try {
      await this.notificationQueue.upsertSchedulers()
    } catch (error) {
      this.logger.error(`[start] schedules not saved: ${(error as Error).message}`)
    }

    const schedule = new Worker(SCHEDULE_QUEUE, (job) => this.runScheduled(job.name as NotificationJob), {
      connection: this.redisService.connection(),
      concurrency: 1,
    })
    const deliveries = new Worker<DeliverJobData>(
      DELIVER_QUEUE,
      // The notice knows whose it is: the chat comes from its user
      (job) => runAsSystem(() => this.notificationsService.deliver(job.data.notificationId)),
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
