import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { INVITE_DAYS, UserRole, UserStatus } from '@/commons/constants/auth.constant'
import { ForbiddenRoleException } from '@/commons/exceptions/auth/forbidden-role.exception'
import { UserNotFoundException } from '@/commons/exceptions/auth/user-not-found.exception'
import { generateToken, hashToken } from '@/commons/helpers/token.helper'
import { AuthDBRepository } from '@/db/models/auth/authDB.repository'
import { AuthUser } from '@/generated/prisma/client'
import { MailService } from '@/providers/mail/mail.service'
import { AuthConfig } from '@/settings/settings.model'

import { AuthService, toSessionUser } from './auth.service'
import { inviteEmail } from './invite-email'

// Configuración ▸ Usuarios (P23, D84): admins invite, activate and disable; nobody gives superadmin from the web
@Injectable()
export class UsersService {
  constructor(
    private readonly authDBRepository: AuthDBRepository,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async list() {
    const [users, invites] = await Promise.all([
      this.authDBRepository.listUsers(),
      this.authDBRepository.listPendingInvites(new Date()),
    ])
    return {
      // The placeholder of the pre-P23 data has no person behind it until `make owner` claims it
      users: users.filter((user) => !user.email.endsWith('@kogane.invalid')).map((user) => toSessionUser(user)),
      invites: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role as UserRole,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      })),
    }
  }

  // With the mail set up (SMTP_USER) the invitation also goes to the email; the link is returned either way, so a mail
  // that did not go out is not a lost invitation
  async invite(email: string, role: UserRole, invitedBy: AuthUser, send = true) {
    const token = generateToken()
    const invite = await this.authDBRepository.createInvite({
      email,
      role,
      tokenHash: hashToken(token),
      invitedById: invitedBy.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60_000),
    })
    const url = this.inviteUrl(token)
    const emailed =
      send &&
      (await this.mailService.send(
        inviteEmail({ to: invite.email, url, invitedBy: invitedBy.name, role, days: INVITE_DAYS }),
      ))
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role as UserRole,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      url,
      emailed,
    }
  }

  inviteUrl(token: string): string {
    const { appUrl } = this.configService.getOrThrow<AuthConfig>('auth')
    return `${appUrl.replace(/\/$/, '')}/entrar?invitacion=${token}`
  }

  async revokeInvite(id: string): Promise<void> {
    await this.authDBRepository.deleteInvite(id)
  }

  async update(id: string, changes: { role?: UserRole; status?: UserStatus }, actor: AuthUser) {
    const user = await this.authDBRepository.findUserById(id)
    if (!user) throw new UserNotFoundException({ id })
    // The superadmin is not touched from the web, and nobody disables themselves out of the app
    if (user.role === UserRole.SUPERADMIN || (id === actor.id && changes.status === UserStatus.DISABLED)) {
      throw new ForbiddenRoleException()
    }
    const updated = await this.authDBRepository.updateUser(id, changes)
    if (changes.status === UserStatus.DISABLED) await this.authService.revokeSessionsOf(id)
    return toSessionUser(updated)
  }
}
