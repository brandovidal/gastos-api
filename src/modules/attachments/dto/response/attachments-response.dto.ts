import { z } from 'zod'

import { responseDto } from '@/commons/helpers/api-response.helper'

import { attachmentResponseSchema } from '../../validations/attachments.validation'

export class AttachmentResponseDto extends responseDto(attachmentResponseSchema) {}
export class AttachmentListResponseDto extends responseDto(z.array(attachmentResponseSchema)) {}
