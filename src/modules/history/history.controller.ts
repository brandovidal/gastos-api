import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'

import { HistoryEntityParamDto, HistoryQueryDto, HistoryTimelineQueryDto } from './dto/request/history.dto'
import { HistoryPageResponseDto } from './dto/response/history-response.dto'
import { HistoryService } from './history.service'

// Historial de cambios (P29, D103, D122)
@ApiRest('history')
@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  @ApiOperation({ summary: 'Every change, newest first, filtered by table, record, source and dates (30 per page)' })
  @ApiOkResponse({ type: HistoryPageResponseDto })
  @ResponseMessage('HISTORY_LISTED', 'History listed')
  list(@Query() query: HistoryQueryDto) {
    return this.historyService.list(query)
  }

  @Get(':entity/:id')
  @ApiOperation({ summary: 'Timeline of one record: what changed, when and from where' })
  @ApiOkResponse({ type: HistoryPageResponseDto })
  @ResponseMessage('HISTORY_FOUND', 'History found')
  timeline(@Param() params: HistoryEntityParamDto, @Query() query: HistoryTimelineQueryDto) {
    return this.historyService.timeline(params.entity, params.id, query.page)
  }
}
