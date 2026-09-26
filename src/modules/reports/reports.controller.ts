import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiProduces } from '@nestjs/swagger'
import type { Response } from 'express'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { REPORT_MIME_TYPES } from '@/commons/constants/report.constant'

import { DebtReportQueryDto } from './dto/request/reports.dto'
import { ReportsService } from './reports.service'

// Descargas (D39): Excel and PDF built by kogane-api, for kogane-app and the bot
@ApiRest('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('debts')
  @ApiOperation({ summary: 'Debts per person (me debe · le debo · neto) and open installments, as Excel or PDF' })
  @ApiProduces(...Object.values(REPORT_MIME_TYPES))
  @ApiOkResponse({
    description: 'The file (attachment)',
    content: Object.fromEntries(
      Object.values(REPORT_MIME_TYPES).map((mimeType) => [mimeType, { schema: { type: 'string', format: 'binary' } }]),
    ),
  })
  async debts(
    @Query() { format, personId, direction, month, year, until, person, state, card, origin, q }: DebtReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.reportsService.debts(format, personId, {
      direction,
      month,
      year,
      until,
      person,
      state,
      card,
      origin,
      q,
    })
    response.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
    })
    return new StreamableFile(file.data)
  }
}
