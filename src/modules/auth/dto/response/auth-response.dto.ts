import { responseDto } from '@/commons/helpers/api-response.helper'

import {
  authConfigSchema,
  createdInviteSchema,
  googleStartSchema,
  invitePreviewSchema,
  sessionUserSchema,
  superadminCreatedSchema,
  telegramLinkSchema,
  usersListSchema,
} from '../../validations/auth.validation'

export class SessionUserResponseDto extends responseDto(sessionUserSchema) {}
export class SuperadminCreatedResponseDto extends responseDto(superadminCreatedSchema) {}
export class AuthConfigResponseDto extends responseDto(authConfigSchema) {}
export class InvitePreviewResponseDto extends responseDto(invitePreviewSchema) {}
export class GoogleStartResponseDto extends responseDto(googleStartSchema) {}
export class TelegramLinkResponseDto extends responseDto(telegramLinkSchema) {}
export class CreatedInviteResponseDto extends responseDto(createdInviteSchema) {}
export class UsersListResponseDto extends responseDto(usersListSchema) {}
