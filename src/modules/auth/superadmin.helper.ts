import { INVITE_DAYS, UserRole, UserStatus } from '@/commons/constants/auth.constant'
import { normalizePhone } from '@/commons/helpers/phone.helper'
import { generateToken, hashToken } from '@/commons/helpers/token.helper'
import { AuthDBRepository } from '@/db/models/auth/authDB.repository'
import { AuthUser } from '@/generated/prisma/client'

import { UserProvisioningService } from './user-provisioning.service'

export interface SuperadminInput {
  email: string
  name?: string
  phone?: string
  documentNumber?: string
}

// The superadmin is never made from the web (D84): `make superadmin` and the backdoor endpoint (ADMIN_BOOTSTRAP_KEY)
// both come here. Creates the account (with its own budget groups, categories and "Yo") or promotes an existing one,
// and gives back the link to define a password
export async function upsertSuperadmin(
  auth: AuthDBRepository,
  provisioning: UserProvisioningService,
  input: SuperadminInput,
): Promise<{ user: AuthUser; inviteToken: string }> {
  const email = input.email.trim().toLowerCase()
  const phone = input.phone ? normalizePhone(input.phone) : null
  if (input.phone && !phone) throw new Error('The mobile must have 9 digits')
  const profile = {
    ...(input.name ? { name: input.name } : {}),
    ...(phone ? { phone } : {}),
    ...(input.documentNumber ? { documentNumber: input.documentNumber } : {}),
  }

  const existing = await auth.findUserByEmail(email)
  const user = existing
    ? await auth.updateUser(existing.id, { role: UserRole.SUPERADMIN, status: UserStatus.ACTIVE, ...profile })
    : await auth.createUser({
        email,
        name: input.name ?? email.split('@')[0],
        role: UserRole.SUPERADMIN,
        status: UserStatus.ACTIVE,
        ...profile,
      })
  if (!existing) await provisioning.provision(user)

  return { user, inviteToken: await createInviteToken(auth, email, UserRole.SUPERADMIN) }
}

// An invitation of any role (a superadmin only for an email that is one already: it lets them set a password)
export async function createInviteToken(
  auth: AuthDBRepository,
  email: string,
  role: string,
  invitedById: string | null = null,
): Promise<string> {
  const token = generateToken()
  await auth.createInvite({
    email,
    role,
    tokenHash: hashToken(token),
    invitedById,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60_000),
  })
  return token
}
