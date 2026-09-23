import { applyDecorators, UseGuards } from '@nestjs/common'
import { ApiSecurity, ApiTags } from '@nestjs/swagger'

import { API_KEY_HEADER } from '../constants/auth.constant'
import { ApiKeyGuard } from '../guards/api-key.guard'

// REST endpoints for kogane-app (P7): Swagger tag, x-api-key in the docs and the guard
export const ApiRest = (tag: string) =>
  applyDecorators(ApiTags(tag), ApiSecurity(API_KEY_HEADER), UseGuards(ApiKeyGuard))
