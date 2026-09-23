import { Module } from '@nestjs/common'

import { CategoryDBRepository } from './categoryDB.repository'

@Module({
  providers: [CategoryDBRepository],
  exports: [CategoryDBRepository],
})
export class CategoryDBModule {}
