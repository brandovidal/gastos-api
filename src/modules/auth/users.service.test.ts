import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { UserRole } from '@/commons/constants/auth.constant'
import { hashToken } from '@/commons/helpers/token.helper'
import { AuthDBRepository } from '@/db/models/auth/authDB.repository'
import { MailService } from '@/providers/mail/mail.service'

import { AuthService } from './auth.service'
import { UsersService } from './users.service'

const mockDB = { createInvite: vi.fn(), listUsers: vi.fn(), listPendingInvites: vi.fn() }
const mockMail = { send: vi.fn() }
const admin = { id: 'a1', name: 'Yisus', role: UserRole.SUPERADMIN }

describe('UsersService.invite', () => {
  let service: UsersService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: AuthDBRepository, useValue: mockDB },
        { provide: AuthService, useValue: {} },
        { provide: MailService, useValue: mockMail },
        { provide: ConfigService, useValue: new ConfigService({ auth: { appUrl: 'https://kogane.example/' } }) },
      ],
    }).compile()
    service = module.get(UsersService)
    mockDB.createInvite.mockImplementation(async (data) => ({ id: 'i1', createdAt: new Date(), ...data }))
  })

  afterEach(() => vi.resetAllMocks())

  it('should keep only the hash of the token, and give the link to hand over', async () => {
    mockMail.send.mockResolvedValue(false)

    const result = await service.invite('sobrino@example.com', UserRole.MEMBER, admin as never)

    const token = result.url.split('invitacion=')[1]
    expect(result.url).toBe(`https://kogane.example/entrar?invitacion=${token}`)
    expect(mockDB.createInvite).toHaveBeenCalledWith(
      expect.objectContaining({ tokenHash: hashToken(token), invitedById: 'a1' }),
    )
    expect(JSON.stringify(mockDB.createInvite.mock.calls)).not.toContain(token)
  })

  it('should email the invitation with the link, who invites and the role, when the mail is set up', async () => {
    mockMail.send.mockResolvedValue(true)

    const result = await service.invite('sobrino@example.com', UserRole.ADMIN, admin as never)

    expect(result.emailed).toBe(true)
    const [message] = mockMail.send.mock.calls[0]
    expect(message).toMatchObject({ to: 'sobrino@example.com', subject: 'Te invitaron a Kogane' })
    expect(message.text).toContain(result.url)
    expect(message.text).toContain('Yisus te invitó')
    expect(message.text).toContain('administrador')
  })

  it('should not lose the invitation when the email cannot go out: the link is still returned', async () => {
    mockMail.send.mockResolvedValue(false)

    const result = await service.invite('sobrino@example.com', UserRole.MEMBER, admin as never)

    expect(result.emailed).toBe(false)
    expect(result.url).toContain('/entrar?invitacion=')
  })

  it('should not email when the admin only wants the link', async () => {
    const result = await service.invite('sobrino@example.com', UserRole.MEMBER, admin as never, false)

    expect(mockMail.send).not.toHaveBeenCalled()
    expect(result.emailed).toBe(false)
  })
})
