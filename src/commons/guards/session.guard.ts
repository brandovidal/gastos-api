import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { hasRole, SESSION_COOKIE, UserRole } from '@/commons/constants/auth.constant'
import { PUBLIC_KEY, ROLES_KEY } from '@/commons/decorators/auth.decorator'
import { ForbiddenRoleException } from '@/commons/exceptions/auth/forbidden-role.exception'
import { SessionRequiredException } from '@/commons/exceptions/auth/session-required.exception'
import { parseCookies } from '@/commons/helpers/token.helper'
import { AuthService } from '@/modules/auth/auth.service'

// After ApiKeyGuard (which proves the call comes from the web's proxy): who is signed in. The session cookie is
// forwarded by the proxy; the user goes to the request, where TenantInterceptor turns it into the tenant context
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true

    const request = context.switchToHttp().getRequest()
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE]
    const session = token ? await this.authService.validateSession(token) : null
    if (!session) throw new SessionRequiredException()
    // A superadmin who entered as another user: the request is that user's, the actor is the superadmin
    request.user = session.user
    request.impersonatedBy = session.impersonatedBy
    request.actorId = session.impersonatedBy?.id ?? session.user.id

    const minimum = this.reflector.getAllAndOverride<UserRole | undefined>(ROLES_KEY, targets)
    if (minimum && !hasRole(session.user.role, minimum)) throw new ForbiddenRoleException()
    return true
  }
}
