import { timingSafeEqual } from 'node:crypto'

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ADMIN_KEY_HEADER } from '../constants/auth.constant'
import { ForbiddenRoleException } from '../exceptions/auth/forbidden-role.exception'

// The backdoor without a session (D84): ADMIN_BOOTSTRAP_KEY in the header x-admin-key. Off (always refused) when the
// key is not set, so a deployment that never wants it has no such door. The web's proxy does not forward this header
@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('auth.adminBootstrapKey')
    const received = String(context.switchToHttp().getRequest().headers[ADMIN_KEY_HEADER] ?? '')
    if (!expected || received.length !== expected.length) throw new ForbiddenRoleException()
    if (!timingSafeEqual(Buffer.from(received), Buffer.from(expected))) throw new ForbiddenRoleException()
    return true
  }
}
