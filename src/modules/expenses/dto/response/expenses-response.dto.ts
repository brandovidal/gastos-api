import { z } from 'zod'

import { responseDto } from '@/commons/helpers/api-response.helper'

import { expenseRecordResponseSchema } from '../../validations/expenses.validation'

export class ExpenseRecordResponseDto extends responseDto(expenseRecordResponseSchema) {}
export class ExpenseRecordListResponseDto extends responseDto(z.array(expenseRecordResponseSchema)) {}
