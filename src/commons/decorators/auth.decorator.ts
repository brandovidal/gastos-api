import { SetMetadata } from '@nestjs/common'

import { UserRole } from '@/commons/constants/auth.constant'

export const PUBLIC_KEY = 'isPublic'
export const ROLES_KEY = 'roles'

// The route needs the x-api-key but no session: sign-in itself
export const Public = () => SetMetadata(PUBLIC_KEY, true)

// At least this role (a superadmin passes an admin route, an admin a member one)
export const RequireRole = (minimum: UserRole) => SetMetadata(ROLES_KEY, minimum)
