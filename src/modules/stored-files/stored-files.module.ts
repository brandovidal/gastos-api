import { Module } from '@nestjs/common'

import { StoredFileDBModule } from '@/db/models/stored-file/storedFileDB.module'
import { StorageProviderModule } from '@/providers/storage/storage.module'

import { StoredFilesService } from './stored-files.service'

@Module({
  imports: [StoredFileDBModule, StorageProviderModule],
  providers: [StoredFilesService],
  exports: [StoredFilesService],
})
export class StoredFilesModule {}
