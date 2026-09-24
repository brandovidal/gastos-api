import { z } from 'zod'

import { responseDto } from '@/commons/helpers/api-response.helper'

import { statementResponseSchema, statementSummaryResponseSchema } from '../../validations/statements.validation'

export class StatementResponseDto extends responseDto(statementResponseSchema) {}
export class StatementListResponseDto extends responseDto(z.array(statementSummaryResponseSchema)) {}
