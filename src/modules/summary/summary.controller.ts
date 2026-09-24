import { Body, Controller, Get, Put, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'

import {
  MonthlyBudgetResponseDto,
  SummaryHistoryResponseDto,
  SummaryResponseDto,
} from './dto/response/summary-response.dto'
import { HistoryQueryDto, MonthlyBudgetDto, SummaryQueryDto } from './dto/request/summary.dto'
import { SummaryService } from './summary.service'

@ApiRest('summary')
@Controller('summary')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Get()
  @ApiOperation({
    summary: 'Month totals by destination and person, budget, extra incomes, spending per category and group, surplus',
  })
  @ApiOkResponse({ type: SummaryResponseDto })
  @ResponseMessage('SUMMARY_FOUND', 'Summary found')
  get(@Query() query: SummaryQueryDto) {
    return this.summaryService.get(query)
  }

  @Get('history')
  @ApiOperation({ summary: 'Salary, extra incomes, spent and surplus of the last months up to month/year' })
  @ApiOkResponse({ type: SummaryHistoryResponseDto })
  @ResponseMessage('SUMMARY_HISTORY_FOUND', 'Summary history found')
  history(@Query() query: HistoryQueryDto) {
    return this.summaryService.history(query)
  }

  @Put('budget')
  @ApiOperation({ summary: 'Set the salary and spending limit of a month' })
  @ApiOkResponse({ type: MonthlyBudgetResponseDto })
  @ResponseMessage('BUDGET_SAVED', 'Budget saved')
  setBudget(@Body() body: MonthlyBudgetDto) {
    return this.summaryService.setBudget(body)
  }
}
