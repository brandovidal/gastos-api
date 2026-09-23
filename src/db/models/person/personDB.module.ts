import { Module } from '@nestjs/common'

import { PersonDBRepository } from './personDB.repository'
import { PersonDBSerializer } from './personDB.serializer'

@Module({
  providers: [PersonDBRepository, PersonDBSerializer],
  exports: [PersonDBRepository, PersonDBSerializer],
})
export class PersonDBModule {}
