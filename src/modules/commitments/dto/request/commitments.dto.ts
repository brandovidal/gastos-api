import { createZodDto } from 'nestjs-zod'

import {
  commitmentListQuerySchema,
  contributionSchema,
  createCommitmentSchema,
  updateCommitmentSchema,
  updateContributionSchema,
} from '../../validations/commitments.validation'

export class CommitmentListQueryDto extends createZodDto(commitmentListQuerySchema) {}
export class CreateCommitmentDto extends createZodDto(createCommitmentSchema) {}
export class UpdateCommitmentDto extends createZodDto(updateCommitmentSchema) {}
export class ContributionDto extends createZodDto(contributionSchema) {}
export class UpdateContributionDto extends createZodDto(updateContributionSchema) {}
