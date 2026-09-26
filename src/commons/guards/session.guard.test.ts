import { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { vi } from 'vitest'

import { UserRole } from '@/commons/constants/auth.constant'
import { ForbiddenRoleException } from '@/commons/exceptions/auth/forbidden-role.exception'
import { SessionRequiredException } from '@/commons/exceptions/auth/session-required.exception'
import { AuthService } from '@/modules/auth/auth.service'

import { SessionGuard } from './session.guard'

const mockAuth = { validateSession: vi.fn() }
const handler = () => undefined

const contextOf = (cookie: string | undefined, request: Record<string, unknown> = {}) =>
  ({
    switchToHttp: () => ({ getRequest: () => Object.assign(request, { headers: { cookie } }) }),
    getHandler: () => handler,
    getClass: () => class {},
  }) as unknown as ExecutionContext

const user = (role: UserRole) => ({ id: `${role}-1`, role })

describe('SessionGuard', () => {
  const reflector = new Reflector()
  const guard = new SessionGuard(mockAuth as unknown as AuthService, reflector)

  afterEach(() => {
    vi.restoreAllMocks()
    mockAuth.validateSession.mockReset()
  })

  it('should let a signed-in user through and leave them on the request, with themselves as the actor', async () => {
    mockAuth.validateSession.mockResolvedValue({ user: user(UserRole.MEMBER), impersonatedBy: null })
    const request: Record<string, any> = {}

    expect(await guard.canActivate(contextOf('kogane_session=tok', request))).toBe(true)

    expect(mockAuth.validateSession).toHaveBeenCalledWith('tok')
    expect(request.user.id).toBe('member-1')
    expect(request.actorId).toBe('member-1')
  })

  it('should say the superadmin is the actor when they entered as another user', async () => {
    mockAuth.validateSession.mockResolvedValue({
      user: user(UserRole.MEMBER),
      impersonatedBy: user(UserRole.SUPERADMIN),
    })
    const request: Record<string, any> = {}

    await guard.canActivate(contextOf('kogane_session=tok', request))

    expect(request.user.id).toBe('member-1')
    expect(request.actorId).toBe('superadmin-1')
  })

  it('should send whoever has no valid session to sign in (401)', async () => {
    await expect(guard.canActivate(contextOf(undefined))).rejects.toThrow(SessionRequiredException)
    mockAuth.validateSession.mockResolvedValue(null)
    await expect(guard.canActivate(contextOf('kogane_session=old'))).rejects.toThrow(SessionRequiredException)
  })

  it('should skip a public route without asking for a session', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true)

    expect(await guard.canActivate(contextOf(undefined))).toBe(true)
    expect(mockAuth.validateSession).not.toHaveBeenCalled()
  })

  describe('a route that needs a role', () => {
    const needs = (minimum: UserRole) =>
      vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => (key === 'roles' ? minimum : undefined))

    it('should stop a member at an admin route, and let an admin and the superadmin in', async () => {
      needs(UserRole.ADMIN)

      mockAuth.validateSession.mockResolvedValue({ user: user(UserRole.MEMBER), impersonatedBy: null })
      await expect(guard.canActivate(contextOf('kogane_session=t'))).rejects.toThrow(ForbiddenRoleException)

      for (const role of [UserRole.ADMIN, UserRole.SUPERADMIN]) {
        mockAuth.validateSession.mockResolvedValue({ user: user(role), impersonatedBy: null })
        expect(await guard.canActivate(contextOf('kogane_session=t'))).toBe(true)
      }
    })

    it('should keep the superadmin routes for the superadmin alone', async () => {
      needs(UserRole.SUPERADMIN)
      mockAuth.validateSession.mockResolvedValue({ user: user(UserRole.ADMIN), impersonatedBy: null })

      await expect(guard.canActivate(contextOf('kogane_session=t'))).rejects.toThrow(ForbiddenRoleException)
    })
  })
})
