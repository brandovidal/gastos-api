import { Body, Controller, Get, Put } from '@nestjs/common'
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger'

import { ApiRest } from '@/commons/decorators/api-rest.decorator'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { BudgetSettingDBRepository } from '@/db/models/budget-setting/budgetSettingDB.repository'

import { UpdateBudgetSettingsDto } from './dto/request/budget.dto'
import { BudgetSettingsResponseDto } from './dto/response/budget-response.dto'

// Configuración ▸ Presupuesto (D96, D107): whether Recurrentes and Plataformas add to the budget
@ApiRest('budget-settings')
@Controller('budget-settings')
export class BudgetSettingsController {
  constructor(private readonly budgetSettingDBRepository: BudgetSettingDBRepository) {}

  @Get()
  @ApiOperation({ summary: 'What adds to the budget besides fixed costs, cards and day to day' })
  @ApiOkResponse({ type: BudgetSettingsResponseDto })
  @ResponseMessage('BUDGET_SETTINGS_FOUND', 'Budget settings found')
  get() {
    return this.budgetSettingDBRepository.get()
  }

  @Put()
  @ApiOperation({ summary: 'Switch Recurrentes or Plataformas on or off in the budget' })
  @ApiOkResponse({ type: BudgetSettingsResponseDto })
  @ResponseMessage('BUDGET_SETTINGS_SAVED', 'Budget settings saved')
  update(@Body() body: UpdateBudgetSettingsDto) {
    return this.budgetSettingDBRepository.update(body)
  }
}
