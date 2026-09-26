import { createZodDto } from 'nestjs-zod'

import {
  acceptInviteSchema,
  changePasswordSchema,
  createSuperadminSchema,
  createInviteSchema,
  googleCallbackQuerySchema,
  googleStartQuerySchema,
  loginSchema,
  updateUserSchema,
} from '../../validations/auth.validation'

export class CreateSuperadminDto extends createZodDto(createSuperadminSchema) {}
export class LoginDto extends createZodDto(loginSchema) {}
export class AcceptInviteDto extends createZodDto(acceptInviteSchema) {}
export class GoogleStartQueryDto extends createZodDto(googleStartQuerySchema) {}
export class GoogleCallbackQueryDto extends createZodDto(googleCallbackQuerySchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export class CreateInviteDto extends createZodDto(createInviteSchema) {}
export class UpdateUserDto extends createZodDto(updateUserSchema) {}
