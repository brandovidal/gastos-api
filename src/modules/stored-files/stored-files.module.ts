import { Module } from '@nestjs/common'

import { StoredFileDBModule } from '@/db/models/stored-file/storedFileDB.module'
import { StorageProviderModule } from '@/providers/storage/storage.module'

import { StoredFilesCleanupTask } from './stored-files-cleanup.task'
import { StoredFilesService } from './stored-files.service'

@Module({
  imports: [StoredFileDBModule, StorageProviderModule],
  providers: [StoredFilesService, StoredFilesCleanupTask],
  exports: [StoredFilesService],
})
export class StoredFilesModule {}
