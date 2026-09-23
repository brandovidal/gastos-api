import { responseDto } from '@/commons/helpers/api-response.helper'

import { conversationResultSchema } from '../../validations/messages.validation'

export class ConversationResultResponseDto extends responseDto(conversationResultSchema) {}
