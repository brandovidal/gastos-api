import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiBody, ApiOkResponse, ApiOperation, ApiParam } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { ExpenseResource } from '@/db/models/expense-record/expenseRecordDB.repository'

import { ExpenseRecordListResponseDto, ExpenseRecordResponseDto } from './dto/response/expenses-response.dto'
import { ExpenseBodyDto, ExpenseListQueryDto, ExpensePatchDto } from './dto/request/expenses.dto'
import { ExpensesService } from './expenses.service'

const resourceParam = new ParseEnumPipe(ExpenseResource)
const RESOURCE_DOC = { name: 'resource', enum: ExpenseResource }
const BODY_DOC = { type: ExpenseBodyDto, description: 'Columns of the table (validated per resource)' }
const PATCH_DOC = { type: ExpensePatchDto, description: 'Columns to change (validated per resource)' }

@ApiRest('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get(':resource')
  @ApiParam(RESOURCE_DOC)
  @ApiOperation({ summary: 'List a table (month/year filter by payment month, or by spent date for daily expenses)' })
  @ApiOkResponse({ type: ExpenseRecordListResponseDto })
  @ResponseMessage('EXPENSES_LISTED', 'Expenses listed')
  findMany(@Param('resource', resourceParam) resource: ExpenseResource, @Query() query: ExpenseListQueryDto) {
    return this.expensesService.findMany(resource, query)
  }

  @Get(':resource/:id')
  @ApiParam(RESOURCE_DOC)
  @ApiOkResponse({ type: ExpenseRecordResponseDto })
  @ResponseMessage('EXPENSE_FOUND', 'Expense found')
  findById(@Param('resource', resourceParam) resource: ExpenseResource, @Param('id') id: string) {
    return this.expensesService.findById(resource, id)
  }

  @Post(':resource')
  @ApiParam(RESOURCE_DOC)
  @ApiBody(BODY_DOC)
  @ApiOkResponse({ type: ExpenseRecordResponseDto })
  @ResponseMessage('EXPENSE_CREATED', 'Expense created')
  create(@Param('resource', resourceParam) resource: ExpenseResource, @Body() body: unknown) {
    return this.expensesService.create(resource, body)
  }

  @Patch(':resource/:id')
  @ApiParam(RESOURCE_DOC)
  @ApiBody(PATCH_DOC)
  @ApiOkResponse({ type: ExpenseRecordResponseDto })
  @ResponseMessage('EXPENSE_UPDATED', 'Expense updated')
  update(@Param('resource', resourceParam) resource: ExpenseResource, @Param('id') id: string, @Body() body: unknown) {
    return this.expensesService.update(resource, id, body)
  }

  @Delete(':resource/:id')
  @ApiParam(RESOURCE_DOC)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('resource', resourceParam) resource: ExpenseResource, @Param('id') id: string) {
    return this.expensesService.delete(resource, id)
  }
}
