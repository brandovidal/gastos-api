import { z } from 'zod'

import { responseDto } from '@/commons/helpers/api-response.helper'

import {
  monthlyBudgetResponseSchema,
  summaryHistoryResponseSchema,
  summaryResponseSchema,
} from '../../validations/summary.validation'

export class SummaryResponseDto extends responseDto(summaryResponseSchema) {}
export class MonthlyBudgetResponseDto extends responseDto(monthlyBudgetResponseSchema) {}
export class SummaryHistoryResponseDto extends responseDto(z.array(summaryHistoryResponseSchema)) {}
