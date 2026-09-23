import { timingSafeEqual } from 'node:crypto'

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { API_KEY_HEADER } from '../constants/auth.constant'
import { ApiKeyRequiredException } from '../exceptions/auth/api-key-required.exception'
import { InvalidApiKeyException } from '../exceptions/auth/invalid-api-key.exception'

import { AuthConfig } from '@/settings/settings.model'

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const apiKey = request.headers[API_KEY_HEADER]

    if (!apiKey) {
      throw new ApiKeyRequiredException()
    }

    const auth = this.configService.get<AuthConfig>('auth')

    if (!auth?.apiKey || !sameKey(String(apiKey), auth.apiKey)) {
      throw new InvalidApiKeyException()
    }

    return true
  }
}

// Constant-time comparison: the time to reject a key does not reveal how much of it matched
function sameKey(received: string, expected: string): boolean {
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
