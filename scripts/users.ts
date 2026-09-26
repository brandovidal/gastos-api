// P23 (D84): the accounts that cannot be made from the web.
//   make superadmin EMAIL=<email> [NAME=<name>] [PHONE=<9 digits>] [DNI=<8 digits>]   → creates (or promotes) a superadmin
//   make owner EMAIL=<email> [NAME=<name>] [ROLE=admin|member]   → the data that existed before P23 belongs to this email
//   make user-invite EMAIL=<email> [ROLE=admin|member]   → an invitation link (valid for 7 days)
// Add SEND=yes to any of them to also email the link (needs SMTP_USER and SMTP_APP_PASSWORD).
// Each prints a link to define a password; Google needs nothing (the same email signs in). The superadmin is never
// created from the web.
import { ConfigService } from '@nestjs/config'

import { INVITE_DAYS, LEGACY_OWNER_ID, UserRole, UserStatus } from '../src/commons/constants/auth.constant'
import { normalizePhone } from '../src/commons/helpers/phone.helper'
import { AuthDBRepository } from '../src/db/models/auth/authDB.repository'
import { PrismaService } from '../src/db/prisma/prisma.service'
import { MailService } from '../src/providers/mail/mail.service'
import { inviteEmail } from '../src/modules/auth/invite-email'
import { createInviteToken, upsertSuperadmin } from '../src/modules/auth/superadmin.helper'
import { UserProvisioningService } from '../src/modules/auth/user-provisioning.service'

async function main() {
  const [command, rawEmail, ...rest] = process.argv.slice(2)
  const email = rawEmail?.trim().toLowerCase()
  const name = rest.find((arg) => arg.startsWith('--name='))?.slice(7)
  const roleArg = rest.find((arg) => arg.startsWith('--role='))?.slice(7)
  const phone = rest.find((arg) => arg.startsWith('--phone='))?.slice(8)
  const send = rest.includes('--send')
  const documentNumber = rest.find((arg) => arg.startsWith('--dni='))?.slice(6)
  if (!command || !email?.includes('@'))
    throw new Error('Usage: users.ts <superadmin|owner|invite> <email> [--name=…] [--role=admin|member]')

  const url = process.env.DATABASE_URL
  const prisma = new PrismaService(new ConfigService({ db: { url, authToken: process.env.DATABASE_AUTH_TOKEN } }))
  await prisma.onModuleInit()
  const auth = new AuthDBRepository(prisma)

  try {
    console.log(`Base de datos: ${url?.split('?')[0]}${url?.startsWith('libsql://') ? '  ⚠️  REMOTA (Turso)' : ''}\n`)
    const existing = await auth.findUserByEmail(email)

    if (command === 'superadmin') {
      const { user, inviteToken } = await upsertSuperadmin(auth, new UserProvisioningService(prisma), {
        email,
        name,
        phone,
        documentNumber,
      })
      console.log(`✔ Superadmin: ${user.name} <${user.email}>${user.phone ? ` · ${user.phone}` : ''}`)
      await printAccess(inviteToken, email, UserRole.SUPERADMIN, send)
    } else if (command === 'owner') {
      const owner = await auth.findUserById(LEGACY_OWNER_ID)
      if (!owner) throw new Error('The owner of the data does not exist: run make db-deploy first')
      if (existing && existing.id !== owner.id)
        throw new Error(`${email} already is another user: the pre-P23 data belongs to ${owner.email}`)
      const role = roleArg ?? UserRole.ADMIN
      if (![UserRole.ADMIN, UserRole.MEMBER].includes(role as UserRole)) throw new Error('ROLE must be admin or member')
      const normalized = phone ? normalizePhone(phone) : null
      if (phone && !normalized) throw new Error('The mobile must have 9 digits')
      const user = await auth.updateUser(owner.id, {
        email,
        role,
        status: UserStatus.ACTIVE,
        ...(name ? { name } : {}),
        ...(normalized ? { phone: normalized } : {}),
        ...(documentNumber ? { documentNumber } : {}),
      })
      console.log(`✔ Dueño de los datos anteriores a P23: ${user.name} <${user.email}> (${user.role})`)
      await printAccess(await createInviteToken(auth, email, role), email, role, send)
    } else if (command === 'invite') {
      const role = roleArg ?? UserRole.MEMBER
      if (![UserRole.ADMIN, UserRole.MEMBER].includes(role as UserRole)) throw new Error('ROLE must be admin or member')
      await printAccess(await createInviteToken(auth, email, role), email, role, send)
    } else {
      throw new Error(`Unknown command ${command}`)
    }
  } finally {
    await prisma.onModuleDestroy()
  }
}

async function printAccess(token: string, email: string, role: string, send: boolean) {
  const appUrl = (process.env.APP_URL ?? 'http://localhost:4000').replace(/\/$/, '')
  const url = `${appUrl}/entrar?invitacion=${token}`
  console.log(
    `\nEntra con Google usando ese correo, o define una contraseña con este enlace (${INVITE_DAYS} días, un solo uso):\n  ${url}\n`,
  )
  if (!send) return
  const mail = new MailService(
    new ConfigService({
      mail: {
        user: process.env.SMTP_USER,
        appPassword: process.env.SMTP_APP_PASSWORD,
        fromName: process.env.SMTP_FROM_NAME ?? 'Kogane',
      },
    }),
  )
  if (!mail.isEnabled)
    return console.log(
      'No se envió el correo: falta SMTP_USER y SMTP_APP_PASSWORD (contraseña de aplicación de Gmail) en el archivo .env.\n',
    )
  const sent = await mail.send(
    inviteEmail({ to: email, url, invitedBy: 'Kogane', role: role as UserRole, days: INVITE_DAYS }),
  )
  console.log(
    sent
      ? `✔ Correo enviado a ${email}\n`
      : `⚠️  Gmail no aceptó el correo a ${email} (revisa la contraseña de aplicación); usa el enlace de arriba\n`,
  )
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
