import { Module } from '@nestjs/common'

import { StoredFileDBRepository } from './storedFileDB.repository'

@Module({
  providers: [StoredFileDBRepository],
  exports: [StoredFileDBRepository],
})
export class StoredFileDBModule {}
