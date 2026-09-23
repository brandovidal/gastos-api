import { createZodDto } from 'nestjs-zod'

import { successResponseSchema } from '@/commons/helpers/api-response.helper'

import { healthSchema } from '../../validations/health.validation'

export class HealthResponseDto extends createZodDto(successResponseSchema(healthSchema)) {}
