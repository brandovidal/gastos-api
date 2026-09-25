import { Module } from '@nestjs/common'

import { BudgetGroupDBModule } from '@/db/models/budget-group/budgetGroupDB.module'
import { CardHolderDBModule } from '@/db/models/card-holder/cardHolderDB.module'
import { CategoryDBModule } from '@/db/models/category/categoryDB.module'
import { PaymentMethodDBModule } from '@/db/models/payment-method/paymentMethodDB.module'
import { PersonDBModule } from '@/db/models/person/personDB.module'

import {
  BudgetGroupsController,
  CategoriesController,
  PaymentMethodsController,
  PeopleController,
} from './catalogs.controller'

@Module({
  imports: [PersonDBModule, PaymentMethodDBModule, CardHolderDBModule, CategoryDBModule, BudgetGroupDBModule],
  controllers: [PeopleController, PaymentMethodsController, CategoriesController, BudgetGroupsController],
})
export class CatalogsModule {}
