import { responseDto } from '@/commons/helpers/api-response.helper'

import {
  draftDetailResponseSchema,
  draftListResponseSchema,
  draftResponseSchema,
  draftSavedResponseSchema,
} from '../../validations/drafts.validation'

export class DraftResponseDto extends responseDto(draftResponseSchema) {}
export class DraftListResponseDto extends responseDto(draftListResponseSchema) {}
export class DraftDetailResponseDto extends responseDto(draftDetailResponseSchema) {}
export class DraftSavedResponseDto extends responseDto(draftSavedResponseSchema) {}
