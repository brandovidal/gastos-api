import { z } from 'zod'

import { responseDto } from '@/commons/helpers/api-response.helper'

import {
  commitmentDetailResponseSchema,
  commitmentResponseSchema,
  contributionResponseSchema,
  generatedInstallmentsResponseSchema,
} from '../../validations/commitments.validation'

export class CommitmentListResponseDto extends responseDto(z.array(commitmentResponseSchema)) {}
export class CommitmentDetailResponseDto extends responseDto(commitmentDetailResponseSchema) {}
export class ContributionResponseDto extends responseDto(contributionResponseSchema) {}
export class GeneratedInstallmentsResponseDto extends responseDto(generatedInstallmentsResponseSchema) {}
