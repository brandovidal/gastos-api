import { z } from 'zod'

// Swagger only: every successful response is wrapped by ResponseInterceptor in this envelope
export const successResponseSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    success: z.literal(true),
    code: z.string(),
    status: z.number().int(),
    message: z.string(),
    data,
  })
