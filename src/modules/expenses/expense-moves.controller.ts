import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'

import { MoveSeriesDto } from './dto/request/expense-moves.dto'
import { MoveSeriesResponseDto } from './dto/response/expense-moves-response.dto'
import { ExpenseMovesService } from './expense-moves.service'

// "Pasar a…" of the ⋯ menu (D106). Not under /expenses: it would collide with /expenses/:resource
@ApiRest('expenses')
@Controller('expense-moves')
export class ExpenseMovesController {
  constructor(private readonly expenseMovesService: ExpenseMovesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move a row and its whole series between fixed costs, Recurrentes and Plataformas (dryRun counts it)',
  })
  @ApiOkResponse({ type: MoveSeriesResponseDto })
  @ResponseMessage('EXPENSE_SERIES_MOVED', 'Expense series moved')
  move(@Body() body: MoveSeriesDto) {
    return this.expenseMovesService.move(body)
  }
}
