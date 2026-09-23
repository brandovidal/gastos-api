import { createZodDto } from 'nestjs-zod'

import { messageActionSchema, sendMessageSchema } from '../../validations/messages.validation'

export class SendMessageDto extends createZodDto(sendMessageSchema) {}
export class MessageActionDto extends createZodDto(messageActionSchema) {}
