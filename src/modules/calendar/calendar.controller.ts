import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'

import { CalendarService } from './calendar.service'
import { CalendarQueryDto, InstallmentsQueryDto, PayEventDto } from './dto/request/calendar.dto'
import {
  CalendarEventsResponseDto,
  CommittedInstallmentsResponseDto,
  PayEventResponseDto,
} from './dto/response/calendar-response.dto'

// Payment calendar (P20, D89)
@ApiRest('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  @ApiOperation({
    summary: 'Card closing and payment days, due dates and recurring expenses between two days (at most 100)',
  })
  @ApiOkResponse({ type: CalendarEventsResponseDto })
  @ResponseMessage('CALENDAR_LISTED', 'Calendar listed')
  events(@Query() { from, to }: CalendarQueryDto) {
    return this.calendarService.events(from, to)
  }

  @Get('installments')
  @ApiOperation({ summary: 'Card installments of the next months, including the ones still to be generated' })
  @ApiOkResponse({ type: CommittedInstallmentsResponseDto })
  @ResponseMessage('INSTALLMENTS_LISTED', 'Committed installments listed')
  installments(@Query() { months }: InstallmentsQueryDto) {
    return this.calendarService.installments(months)
  }

  @Post('pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a calendar event paid: card statement, fixed cost, subscription or debt installment' })
  @ApiOkResponse({ type: PayEventResponseDto })
  @ResponseMessage('CALENDAR_EVENT_PAID', 'Payment registered')
  async pay(@Body() { refType, refId }: PayEventDto) {
    return { outcome: await this.calendarService.pay(refType, refId) }
  }
}
