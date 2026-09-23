import { responseDto } from '@/commons/helpers/api-response.helper'

import { monthlyBudgetResponseSchema, summaryResponseSchema } from '../../validations/summary.validation'

export class SummaryResponseDto extends responseDto(summaryResponseSchema) {}
export class MonthlyBudgetResponseDto extends responseDto(monthlyBudgetResponseSchema) {}
