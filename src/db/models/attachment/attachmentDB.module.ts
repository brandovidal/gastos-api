import { Module } from '@nestjs/common'

import { AttachmentDBRepository } from './attachmentDB.repository'

@Module({
  providers: [AttachmentDBRepository],
  exports: [AttachmentDBRepository],
})
export class AttachmentDBModule {}
