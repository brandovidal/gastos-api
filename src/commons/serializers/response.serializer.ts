import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
  StreamableFile,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ZodValidationException } from 'nestjs-zod'
import { ZodError } from 'zod'

import { Observable, throwError } from 'rxjs'
import { catchError, map } from 'rxjs/operators'

import { RESPONSE_MESSAGE_METADATA } from '../decorators/response-message.decorator'

import { ErrorResponse, ResponseMessageProps, ResponseSuccess } from '../types/response.types'

import { ResponseCode } from '../constants/response.constant'
import { LOG_CONTEXT_KEY } from '../constants/logger.constant'
import { LogSanitizer } from '../helpers/log-sanitizer.helper'

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ResponseSuccess<T> | StreamableFile> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseSuccess<T> | StreamableFile> {
    return next.handle().pipe(
      map((res: unknown) => this.responseHandler(res, context)),
      catchError((err) => throwError(() => this.errorHandler(err, context))),
    )
  }

  errorHandler(exception, context: ExecutionContext) {
    const ctx = context.switchToHttp()

    const response = ctx.getResponse()
    const request = ctx.getRequest()

    let status = HttpStatus.INTERNAL_SERVER_ERROR as number
    let code = ResponseCode.INTERNAL_SERVER_ERROR as string

    let details
    if (exception.name === 'ZodValidationException') {
      const zodError = (exception as ZodValidationException).getZodError() as ZodError

      status = HttpStatus.BAD_REQUEST
      code = ResponseCode.VALIDATION_REQUEST_ERROR
      details = zodError.issues
    } else if (exception instanceof HttpException) {
      const httpError = exception.getResponse() as ErrorResponse

      status = exception.getStatus()
      code =
        httpError.code ?? (status < 500 ? ResponseCode.VALIDATION_REQUEST_ERROR : ResponseCode.INTERNAL_SERVER_ERROR)
      details = httpError.details ?? {}
    } else {
      details = {}
    }

    const { body } = request

    const message = exception.message

    const result: ErrorResponse = {
      success: false,
      code,
      status,
      message,
      details,
      stack: process.env.NODE_ENV === 'dev' ? exception.stack : undefined,
    }

    request[LOG_CONTEXT_KEY] = {
      reqBody: LogSanitizer.sanitize(body),
      error: {
        exceptionType: exception.constructor?.name ?? exception.name,
        code,
        status,
        message,
        details: LogSanitizer.sanitize(details),
      },
    }

    response.status(status).json(result)
  }

  responseHandler(responseData, context: ExecutionContext) {
    // Downloads (Excel / PDF, D39) go out as they are, without the JSON envelope
    if (responseData instanceof StreamableFile) return responseData

    const ctx = context.switchToHttp()

    const response = ctx.getResponse()
    const request = ctx.getRequest()

    const status = response.statusCode
    const metadata = this.reflector.get<ResponseMessageProps | undefined>(
      RESPONSE_MESSAGE_METADATA,
      context.getHandler(),
    )

    const code = metadata?.code ?? ResponseCode.SUCCESS
    const message = metadata?.message ?? ResponseCode.SUCCESS

    const { body } = request

    const result: ResponseSuccess<T> = {
      success: true,
      code,
      status,
      message,
      data: responseData,
    }

    request[LOG_CONTEXT_KEY] = {
      reqBody: LogSanitizer.sanitize(body),
      response: { code, message, data: LogSanitizer.sanitize(responseData) },
    }

    return result
  }
}
