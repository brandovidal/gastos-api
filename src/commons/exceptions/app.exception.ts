import { HttpException } from '@nestjs/common'

export class AppException extends HttpException {
  constructor(status: number, code: string, message: string, details?: any) {
    super(
      {
        success: false,
        status,
        message,
        code,
        details,
        stack: undefined,
      },
      status,
    )
  }
}
