import { LEGACY_OWNER_ID } from '@/commons/constants/auth.constant'
import { PrismaService } from '@/db/prisma/prisma.service'

import { tenantStorage } from './tenant-context'

// The user a script works for (make import-notion, import-commitments…): EMAIL=<email>, or the owner of the data that
// existed before P23. From here on every query of the script is that user's (P23)
export async function enterScriptUser(
  prisma: Pick<PrismaService, 'authUser'>,
  email?: string,
): Promise<{ id: string; email: string }> {
  const user = email
    ? await prisma.authUser.findUnique({ where: { email: email.trim().toLowerCase() } })
    : await prisma.authUser.findUnique({ where: { id: LEGACY_OWNER_ID } })
  if (!user)
    throw new Error(
      email
        ? `No user with the email ${email}: invite them first (make user-invite)`
        : 'The owner user does not exist: run make db-deploy',
    )
  tenantStorage.enterWith({ userId: user.id })
  return { id: user.id, email: user.email }
}
