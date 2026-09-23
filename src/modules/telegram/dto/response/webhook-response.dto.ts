import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

import { successResponseSchema } from '@/commons/helpers/api-response.helper'

export class WebhookResponseDto extends createZodDto(successResponseSchema(z.object({ received: z.literal(true) }))) {}
