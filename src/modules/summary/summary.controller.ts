import { Body, Controller, Get, Put, Query } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'

import { MonthlyBudgetDto, SummaryQueryDto } from './dto/request/summary.dto'
import { SummaryService } from './summary.service'

@ApiRest('summary')
@Controller('summary')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Get()
  @ApiOperation({ summary: 'Month totals by destination and person, salary, limit, surplus and budget groups' })
  @ResponseMessage('SUMMARY_FOUND', 'Summary found')
  get(@Query() query: SummaryQueryDto) {
    return this.summaryService.get(query)
  }

  @Put('budget')
  @ApiOperation({ summary: 'Set the salary and spending limit of a month' })
  @ResponseMessage('BUDGET_SAVED', 'Budget saved')
  setBudget(@Body() body: MonthlyBudgetDto) {
    return this.summaryService.setBudget(body)
  }
}
