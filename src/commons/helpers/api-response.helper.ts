import { createZodDto } from 'nestjs-zod'
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

// Dates leave the API as ISO strings (JSON)
export const dateTimeSchema = z.iso.datetime()

// Base of the response DTOs for @ApiOkResponse: `class XResponseDto extends responseDto(schema) {}`. The class name
// becomes the Swagger component and the kogane-app type (keep it unique). These schemas document the output only.
export const responseDto = (data: z.ZodType) => createZodDto(successResponseSchema(data))

// Deletes answer the envelope with data: null
export class EmptyResponseDto extends responseDto(z.null()) {}
