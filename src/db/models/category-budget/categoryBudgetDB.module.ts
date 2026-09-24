import { Module } from '@nestjs/common'

import { CategoryBudgetDBRepository } from './categoryBudgetDB.repository'

@Module({
  providers: [CategoryBudgetDBRepository],
  exports: [CategoryBudgetDBRepository],
})
export class CategoryBudgetDBModule {}
