import { BeforeApplicationShutdown, Injectable, Logger } from '@nestjs/common'
import { Queue } from 'bullmq'

import { APP_TIME_ZONE } from '@/commons/constants/app.constant'
import {
  DELIVER_ATTEMPTS,
  DELIVER_BACKOFF_MS,
  DELIVER_QUEUE,
  NOTIFICATION_JOB_PATTERNS,
  NotificationJob,
  SCHEDULE_QUEUE,
  UPCOMING_REFRESH_DELAY_MS,
} from '@/commons/constants/notification.constant'
import { RedisService } from '@/providers/redis/redis.service'

export interface DeliverJobData {
  notificationId: string
}

// The two BullMQ queues of P20 (D87): scheduled jobs (cron in America/Lima) and the Telegram delivery with retries.
// Global so any module can ask for a refresh of the upcoming reminders; without Redis every call is a no-op.
@Injectable()
export class NotificationQueue implements BeforeApplicationShutdown {
  private readonly logger = new Logger(NotificationQueue.name)
  readonly schedule: Queue | null
  readonly deliveries: Queue<DeliverJobData> | null

  constructor(redisService: RedisService) {
    this.schedule = redisService.isEnabled ? new Queue(SCHEDULE_QUEUE, { connection: redisService.connection() }) : null
    this.deliveries = redisService.isEnabled
      ? new Queue<DeliverJobData>(DELIVER_QUEUE, { connection: redisService.connection() })
      : null
  }

  get isEnabled(): boolean {
    return this.schedule !== null
  }

  // One job scheduler per job: upserting keeps a single schedule across restarts and deploys, and a job whose time
  // passed while the process was down runs when it comes back
  async upsertSchedulers(): Promise<void> {
    if (!this.schedule) return
    for (const job of Object.values(NotificationJob)) {
      await this.schedule.upsertJobScheduler(
        job,
        { pattern: NOTIFICATION_JOB_PATTERNS[job], tz: APP_TIME_ZONE },
        { name: job, opts: { removeOnComplete: 50, removeOnFail: 100 } },
      )
    }
  }

  // After a change the upcoming reminders are rebuilt once, 30 s later, however many changes come in between
  requestRefresh(): void {
    if (!this.schedule) return
    this.schedule
      .add(
        NotificationJob.UPCOMING_REFRESH,
        {},
        {
          delay: UPCOMING_REFRESH_DELAY_MS,
          deduplication: { id: NotificationJob.UPCOMING_REFRESH, ttl: UPCOMING_REFRESH_DELAY_MS },
          removeOnComplete: true,
          removeOnFail: 20,
        },
      )
      .catch((error: Error) => this.logger.warn(`[requestRefresh] ${error.message}`))
  }

  // false without Redis: the caller sends it right away instead
  async deliver(notificationId: string): Promise<boolean> {
    if (!this.deliveries) return false
    await this.deliveries.add(
      'deliver',
      { notificationId },
      {
        jobId: notificationId,
        attempts: DELIVER_ATTEMPTS,
        backoff: { type: 'exponential', delay: DELIVER_BACKOFF_MS },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    )
    return true
  }

  async beforeApplicationShutdown() {
    await Promise.all([this.schedule?.close(), this.deliveries?.close()])
  }
}
