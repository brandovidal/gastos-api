import { createZodDto } from 'nestjs-zod'

import { attachmentListQuerySchema, uploadAttachmentSchema } from '../../validations/attachments.validation'

export class UploadAttachmentDto extends createZodDto(uploadAttachmentSchema) {}
export class AttachmentListQueryDto extends createZodDto(attachmentListQuerySchema) {}
