import { z } from 'zod'

import { responseDto } from '@/commons/helpers/api-response.helper'

import {
  categoryBudgetLineSchema,
  categoryBudgetResponseSchema,
  incomeResponseSchema,
} from '../../validations/budget.validation'

export class IncomeResponseDto extends responseDto(incomeResponseSchema) {}
export class IncomeListResponseDto extends responseDto(z.array(incomeResponseSchema)) {}
export class CategoryBudgetResponseDto extends responseDto(categoryBudgetResponseSchema) {}
export class CategoryBudgetLineListResponseDto extends responseDto(z.array(categoryBudgetLineSchema)) {}
