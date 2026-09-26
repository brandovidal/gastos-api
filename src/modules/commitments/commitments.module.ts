import { Module } from '@nestjs/common'

import { CommitmentDBModule } from '@/db/models/commitment/commitmentDB.module'
import { PersonDBModule } from '@/db/models/person/personDB.module'
import { AttachmentsModule } from '@/modules/attachments/attachments.module'

import { CommitmentsController } from './commitments.controller'
import { CommitmentsService } from './commitments.service'

@Module({
  imports: [CommitmentDBModule, PersonDBModule, AttachmentsModule],
  controllers: [CommitmentsController],
  providers: [CommitmentsService],
  exports: [CommitmentsService],
})
export class CommitmentsModule {}
