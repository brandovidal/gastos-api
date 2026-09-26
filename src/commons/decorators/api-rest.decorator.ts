import { applyDecorators, UseGuards } from '@nestjs/common'
import { ApiSecurity, ApiTags } from '@nestjs/swagger'

import { API_KEY_HEADER } from '../constants/auth.constant'
import { ApiKeyGuard } from '../guards/api-key.guard'
import { SessionGuard } from '../guards/session.guard'

// REST endpoints for kogane-app (P7): Swagger tag, x-api-key in the docs and the guards: the key (the call comes from the
// web's proxy) and the session (P23: who is signed in; @Public() routes skip it)
export const ApiRest = (tag: string) =>
  applyDecorators(ApiTags(tag), ApiSecurity(API_KEY_HEADER), UseGuards(ApiKeyGuard, SessionGuard))
