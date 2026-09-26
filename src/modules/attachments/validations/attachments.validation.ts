import { z } from 'zod'

import { AttachmentKind, AttachmentRefType } from '@/commons/constants/commitment.constant'
import { dateTimeSchema } from '@/commons/helpers/api-response.helper'

// multipart: the file goes apart, these are its text fields
export const uploadAttachmentSchema = z.object({
  refType: z.enum(AttachmentRefType),
  refId: z.string().min(1),
  kind: z.enum(AttachmentKind).optional().describe('otro by default'),
  name: z.string().trim().min(1).max(120).optional().describe('The name of the file by default'),
})

export const attachmentListQuerySchema = z.object({
  refType: z.enum(AttachmentRefType),
  refId: z.string().min(1),
})

export const attachmentResponseSchema = z.object({
  id: z.string(),
  refType: z.enum(AttachmentRefType),
  refId: z.string(),
  kind: z.enum(AttachmentKind),
  name: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().nullable(),
  url: z.string().nullable().describe('Signed link, valid for a few minutes'),
  createdAt: dateTimeSchema,
})
