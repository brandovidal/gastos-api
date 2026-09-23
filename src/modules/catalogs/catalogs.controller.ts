import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common'
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { BudgetGroupDBRepository } from '@/db/models/budget-group/budgetGroupDB.repository'
import { CategoryDBRepository } from '@/db/models/category/categoryDB.repository'
import { PaymentMethodDBRepository } from '@/db/models/payment-method/paymentMethodDB.repository'
import { PersonDBRepository } from '@/db/models/person/personDB.repository'

import {
  BudgetGroupListResponseDto,
  BudgetGroupResponseDto,
  CategoryListResponseDto,
  CategoryResponseDto,
  PaymentMethodListResponseDto,
  PaymentMethodResponseDto,
  PersonListResponseDto,
  PersonResponseDto,
} from './dto/response/catalogs-response.dto'
import {
  CreateBudgetGroupDto,
  CreateCategoryDto,
  CreatePaymentMethodDto,
  CreatePersonDto,
  UpdateBudgetGroupDto,
  UpdateCategoryDto,
  UpdatePaymentMethodDto,
  UpdatePersonDto,
} from './dto/request/catalogs.dto'

// Catalogs for kogane-app (P7). The bot reads the same tables: changes apply to the AI prompt right away.

@ApiRest('catalogs')
@Controller('people')
export class PeopleController {
  constructor(private readonly personDBRepository: PersonDBRepository) {}

  @Get()
  @ApiOperation({ summary: 'People (active and inactive)' })
  @ApiOkResponse({ type: PersonListResponseDto })
  @ResponseMessage('PEOPLE_LISTED', 'People listed')
  findAll() {
    return this.personDBRepository.findAll()
  }

  @Post()
  @ApiOperation({ summary: 'Add a person; isDefault clears the previous default' })
  @ApiOkResponse({ type: PersonResponseDto })
  @ResponseMessage('PERSON_CREATED', 'Person created')
  create(@Body() body: CreatePersonDto) {
    return this.personDBRepository.create(body)
  }

  @Patch(':id')
  @ApiOkResponse({ type: PersonResponseDto })
  @ResponseMessage('PERSON_UPDATED', 'Person updated')
  update(@Param('id') id: string, @Body() body: UpdatePersonDto) {
    return this.personDBRepository.update(id, body)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a person (expenses keep pointing to it)' })
  @ApiOkResponse({ type: PersonResponseDto })
  @ResponseMessage('PERSON_DEACTIVATED', 'Person deactivated')
  deactivate(@Param('id') id: string) {
    return this.personDBRepository.deactivate(id)
  }
}

@ApiRest('catalogs')
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethodDBRepository: PaymentMethodDBRepository) {}

  @Get()
  @ApiOperation({ summary: 'Payment methods (credit cards included, with their billing days)' })
  @ApiOkResponse({ type: PaymentMethodListResponseDto })
  @ResponseMessage('PAYMENT_METHODS_LISTED', 'Payment methods listed')
  findAll() {
    return this.paymentMethodDBRepository.findAll()
  }

  @Post()
  @ApiOkResponse({ type: PaymentMethodResponseDto })
  @ResponseMessage('PAYMENT_METHOD_CREATED', 'Payment method created')
  create(@Body() body: CreatePaymentMethodDto) {
    return this.paymentMethodDBRepository.createFull(body)
  }

  @Patch(':id')
  @ApiOkResponse({ type: PaymentMethodResponseDto })
  @ResponseMessage('PAYMENT_METHOD_UPDATED', 'Payment method updated')
  update(@Param('id') id: string, @Body() body: UpdatePaymentMethodDto) {
    return this.paymentMethodDBRepository.update(id, body)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a payment method (expenses keep pointing to it)' })
  @ApiOkResponse({ type: PaymentMethodResponseDto })
  @ResponseMessage('PAYMENT_METHOD_DEACTIVATED', 'Payment method deactivated')
  deactivate(@Param('id') id: string) {
    return this.paymentMethodDBRepository.deactivate(id)
  }
}

@ApiRest('catalogs')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoryDBRepository: CategoryDBRepository) {}

  @Get()
  @ApiOkResponse({ type: CategoryListResponseDto })
  @ResponseMessage('CATEGORIES_LISTED', 'Categories listed')
  findAll() {
    return this.categoryDBRepository.findAll()
  }

  @Post()
  @ApiOkResponse({ type: CategoryResponseDto })
  @ResponseMessage('CATEGORY_CREATED', 'Category created')
  create(@Body() body: CreateCategoryDto) {
    return this.categoryDBRepository.create(body)
  }

  @Patch(':id')
  @ApiOkResponse({ type: CategoryResponseDto })
  @ResponseMessage('CATEGORY_UPDATED', 'Category updated')
  update(@Param('id') id: string, @Body() body: UpdateCategoryDto) {
    return this.categoryDBRepository.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a category (409 CATALOG_ITEM_IN_USE while expenses use it)' })
  delete(@Param('id') id: string) {
    return this.categoryDBRepository.delete(id)
  }
}

@ApiRest('catalogs')
@Controller('budget-groups')
export class BudgetGroupsController {
  constructor(private readonly budgetGroupDBRepository: BudgetGroupDBRepository) {}

  @Get()
  @ApiOperation({ summary: 'Budget groups (Relación de gastos) with their share of the income' })
  @ApiOkResponse({ type: BudgetGroupListResponseDto })
  @ResponseMessage('BUDGET_GROUPS_LISTED', 'Budget groups listed')
  findAll() {
    return this.budgetGroupDBRepository.findAll()
  }

  @Post()
  @ApiOkResponse({ type: BudgetGroupResponseDto })
  @ResponseMessage('BUDGET_GROUP_CREATED', 'Budget group created')
  create(@Body() body: CreateBudgetGroupDto) {
    return this.budgetGroupDBRepository.create(body)
  }

  @Patch(':id')
  @ApiOkResponse({ type: BudgetGroupResponseDto })
  @ResponseMessage('BUDGET_GROUP_UPDATED', 'Budget group updated')
  update(@Param('id') id: string, @Body() body: UpdateBudgetGroupDto) {
    return this.budgetGroupDBRepository.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a budget group (409 CATALOG_ITEM_IN_USE while categories belong to it)' })
  delete(@Param('id') id: string) {
    return this.budgetGroupDBRepository.delete(id)
  }
}
