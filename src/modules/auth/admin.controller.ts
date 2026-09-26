import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { ApiHeader, ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger'

import { ADMIN_KEY_HEADER, API_KEY_HEADER } from '@/commons/constants/auth.constant'
import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { AdminKeyGuard } from '@/commons/guards/admin-key.guard'
import { ApiKeyGuard } from '@/commons/guards/api-key.guard'
import { AuthDBRepository } from '@/db/models/auth/authDB.repository'

import { toSessionUser } from './auth.service'
import { CreateSuperadminDto } from './dto/request/auth.dto'
import { SuperadminCreatedResponseDto } from './dto/response/auth-response.dto'
import { upsertSuperadmin } from './superadmin.helper'
import { UserProvisioningService } from './user-provisioning.service'
import { UsersService } from './users.service'

// The backdoor without a shell (D84): makes or promotes a superadmin with ADMIN_BOOTSTRAP_KEY, no session. Refused
// when the key is not set. Not for the web: its proxy does not forward x-admin-key
@ApiTags('admin')
@ApiSecurity(API_KEY_HEADER)
@Controller('admin')
@UseGuards(ApiKeyGuard, AdminKeyGuard)
export class AdminController {
  constructor(
    private readonly authDBRepository: AuthDBRepository,
    private readonly userProvisioningService: UserProvisioningService,
    private readonly usersService: UsersService,
  ) {}

  @Post('superadmins')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: ADMIN_KEY_HEADER, required: true, description: 'ADMIN_BOOTSTRAP_KEY' })
  @ApiOperation({ summary: 'Create or promote a superadmin (backdoor): returns the link to define a password' })
  @ApiOkResponse({ type: SuperadminCreatedResponseDto })
  @ResponseMessage('SUPERADMIN_SAVED', 'Superadmin saved')
  async createSuperadmin(@Body() body: CreateSuperadminDto) {
    const { user, inviteToken } = await upsertSuperadmin(this.authDBRepository, this.userProvisioningService, body)
    return { user: toSessionUser(user), url: this.usersService.inviteUrl(inviteToken) }
  }
}
