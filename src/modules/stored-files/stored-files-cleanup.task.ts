import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'

import { FILE_CLEANUP_FIRST_RUN_MS, FILE_CLEANUP_INTERVAL_MS } from '@/commons/constants/stored-file.constant'

import { StoredFilesService } from './stored-files.service'

// First scheduled task of kogane-api (D44): in-process timers are enough for one instance and one user.
// The R2 lifecycle rule on finance/drafts/ (8 days) is the safety net if a run is missed (docs/deploy.md).
@Injectable()
export class StoredFilesCleanupTask implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(StoredFilesCleanupTask.name)
  private timers: NodeJS.Timeout[] = []

  constructor(private readonly storedFilesService: StoredFilesService) {}

  onApplicationBootstrap() {
    const run = () => {
      this.storedFilesService.deleteExpired().catch((error: Error) => this.logger.error(`[run] ${error.message}`))
    }
    this.timers = [setTimeout(run, FILE_CLEANUP_FIRST_RUN_MS), setInterval(run, FILE_CLEANUP_INTERVAL_MS)]
    this.timers.forEach((timer) => timer.unref())
  }

  onApplicationShutdown() {
    this.timers.forEach((timer) => clearTimeout(timer))
  }
}
