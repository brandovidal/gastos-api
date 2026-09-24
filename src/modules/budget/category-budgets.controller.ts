import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { EmptyResponseDto } from '@/commons/helpers/api-response.helper'
import { CategoryBudgetDBRepository } from '@/db/models/category-budget/categoryBudgetDB.repository'

import { BudgetService } from './budget.service'
import { CategoryBudgetQueryDto, UpsertCategoryBudgetDto } from './dto/request/budget.dto'
import { CategoryBudgetLineListResponseDto, CategoryBudgetResponseDto } from './dto/response/budget-response.dto'

// Límite por categoría (P19): without month it applies to every month; with month it replaces it for that month
@ApiRest('category-budgets')
@Controller('category-budgets')
export class CategoryBudgetsController {
  constructor(
    private readonly budgetService: BudgetService,
    private readonly categoryBudgetDBRepository: CategoryBudgetDBRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Spent vs limit per category in a month (status ok · warning · over)' })
  @ApiOkResponse({ type: CategoryBudgetLineListResponseDto })
  @ResponseMessage('CATEGORY_BUDGETS_LISTED', 'Category budgets listed')
  list(@Query() { month, year }: CategoryBudgetQueryDto) {
    return this.budgetService.byCategory(month, year)
  }

  @Put()
  @ApiOperation({ summary: 'Set the limit of a category, for every month or for one month' })
  @ApiOkResponse({ type: CategoryBudgetResponseDto })
  @ResponseMessage('CATEGORY_BUDGET_SAVED', 'Category budget saved')
  upsert(@Body() body: UpsertCategoryBudgetDto) {
    return this.categoryBudgetDBRepository.upsert(body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a category limit' })
  @ApiOkResponse({ type: EmptyResponseDto })
  @ResponseMessage('CATEGORY_BUDGET_DELETED', 'Category budget deleted')
  async delete(@Param('id') id: string) {
    await this.categoryBudgetDBRepository.delete(id)
    return null
  }
}
