import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { EmptyResponseDto } from '@/commons/helpers/api-response.helper'

import { CreateIncomeDto, IncomeListQueryDto, UpdateIncomeDto } from './dto/request/budget.dto'
import { IncomeListResponseDto, IncomeResponseDto } from './dto/response/budget-response.dto'
import { IncomesService } from './incomes.service'

// Ingresos extra del mes (P19, D65); the salary is set with PUT /v1/summary/budget
@ApiRest('incomes')
@Controller('incomes')
export class IncomesController {
  constructor(private readonly incomesService: IncomesService) {}

  @Get()
  @ApiOperation({ summary: 'Extra incomes of a month' })
  @ApiOkResponse({ type: IncomeListResponseDto })
  @ResponseMessage('INCOMES_LISTED', 'Incomes listed')
  list(@Query() query: IncomeListQueryDto) {
    return this.incomesService.list(query)
  }

  @Post()
  @ApiOperation({ summary: 'Add an extra income (month and year default to receivedAt)' })
  @ApiOkResponse({ type: IncomeResponseDto })
  @ResponseMessage('INCOME_CREATED', 'Income created')
  create(@Body() body: CreateIncomeDto) {
    return this.incomesService.create(body)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an extra income' })
  @ApiOkResponse({ type: IncomeResponseDto })
  @ResponseMessage('INCOME_UPDATED', 'Income updated')
  update(@Param('id') id: string, @Body() body: UpdateIncomeDto) {
    return this.incomesService.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an extra income' })
  @ApiOkResponse({ type: EmptyResponseDto })
  @ResponseMessage('INCOME_DELETED', 'Income deleted')
  async delete(@Param('id') id: string) {
    await this.incomesService.delete(id)
    return null
  }
}
