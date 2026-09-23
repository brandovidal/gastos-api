import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { EmptyResponseDto } from '@/commons/helpers/api-response.helper'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'

import {
  DebtCreatedResponseDto,
  DebtDetailResponseDto,
  DebtListResponseDto,
  DebtResponseDto,
  DebtSummaryResponseDto,
} from './dto/response/debts-response.dto'
import { DebtsService } from './debts.service'
import { CreateDebtDto, DebtListQueryDto, DebtPaymentDto, UpdateDebtDto } from './dto/request/debts.dto'

// Préstamos y deudas (P17, D60): one row per installment, payments recompute the balance and status
@ApiRest('debts')
@Controller('debts')
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Get()
  @ApiOperation({ summary: 'Installments, oldest first, with balance and timing (upcoming · due · late)' })
  @ApiOkResponse({ type: DebtListResponseDto })
  @ResponseMessage('DEBTS_LISTED', 'Debts listed')
  list(@Query() query: DebtListQueryDto) {
    return this.debtsService.list(query)
  }

  @Get('summary')
  @ApiOperation({ summary: 'Per person: owed to me · I owe · net, late and due this month (PEN)' })
  @ApiOkResponse({ type: DebtSummaryResponseDto })
  @ResponseMessage('DEBTS_SUMMARY', 'Debts summary')
  summary() {
    return this.debtsService.summary()
  }

  @Get(':id')
  @ApiOperation({ summary: 'One installment with its confirmed payments' })
  @ApiOkResponse({ type: DebtDetailResponseDto })
  @ResponseMessage('DEBT_FOUND', 'Debt found')
  get(@Param('id') id: string) {
    return this.debtsService.get(id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a debt; installments: n creates one row per month' })
  @ApiOkResponse({ type: DebtCreatedResponseDto })
  @ResponseMessage('DEBT_CREATED', 'Debt created')
  create(@Body() body: CreateDebtDto) {
    return this.debtsService.create(body)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit one installment; paidAmount and status follow the payments' })
  @ApiOkResponse({ type: DebtResponseDto })
  @ResponseMessage('DEBT_UPDATED', 'Debt updated')
  update(@Param('id') id: string, @Body() body: UpdateDebtDto) {
    return this.debtsService.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete one installment and its payments' })
  @ApiOkResponse({ type: EmptyResponseDto })
  @ResponseMessage('DEBT_DELETED', 'Debt deleted')
  delete(@Param('id') id: string) {
    return this.debtsService.delete(id)
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Register a payment (422 DEBT_PAYMENT_EXCEEDS_BALANCE above the balance)' })
  @ApiOkResponse({ type: DebtResponseDto })
  @ResponseMessage('DEBT_PAYMENT_CREATED', 'Payment registered')
  addPayment(@Param('id') id: string, @Body() body: DebtPaymentDto) {
    return this.debtsService.addPayment(id, body)
  }

  @Delete(':id/payments/:paymentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a payment; the balance and status are recomputed' })
  @ApiOkResponse({ type: DebtResponseDto })
  @ResponseMessage('DEBT_PAYMENT_DELETED', 'Payment deleted')
  deletePayment(@Param('id') id: string, @Param('paymentId') paymentId: string) {
    return this.debtsService.deletePayment(id, paymentId)
  }
}
