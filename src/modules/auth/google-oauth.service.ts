import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { AuthTokenKind, OAUTH_STATE_MINUTES } from '@/commons/constants/auth.constant'
import { NotInvitedException } from '@/commons/exceptions/auth/not-invited.exception'
import { generateToken, hashToken } from '@/commons/helpers/token.helper'
import { AuthDBRepository } from '@/db/models/auth/authDB.repository'
import { AuthConfig } from '@/settings/settings.model'

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

export interface GoogleProfile {
  sub: string
  email: string
  name: string
}

export interface GoogleState {
  returnTo: string
  invite: string | null
  linkUserId?: string | null
}

// Only a path of this web: an absolute URL would turn the sign-in into an open redirect
export const safeReturnTo = (value: string | undefined): string =>
  value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/'

// Sign in with Google (P23): the authorization-code flow with the client secret, no library. The code is exchanged at
// Google's token endpoint over TLS and the profile read with that access token, so there is no id_token to verify.
// `state` is a random value kept in a cookie and in the database (one use), against forged callbacks
@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name)

  constructor(
    private readonly configService: ConfigService,
    private readonly authDBRepository: AuthDBRepository,
  ) {}

  private get config(): AuthConfig {
    return this.configService.getOrThrow<AuthConfig>('auth')
  }

  get isEnabled(): boolean {
    return !!this.config.googleClientId && !!this.config.googleClientSecret
  }

  private get redirectUri(): string {
    return `${this.config.appUrl.replace(/\/$/, '')}/api/v1/auth/google/callback`
  }

  // The state goes to the browser in a cookie; the URL carries the same value to Google and back
  async start(
    returnTo: string | undefined,
    invite: string | undefined,
    linkUserId?: string,
  ): Promise<{ url: string; state: string }> {
    if (!this.isEnabled) throw new NotInvitedException({ reason: 'google_disabled' })
    const state = generateToken()
    await this.authDBRepository.createToken({
      kind: AuthTokenKind.GOOGLE_STATE,
      tokenHash: hashToken(state),
      payload: {
        returnTo: safeReturnTo(returnTo),
        invite: invite ?? null,
        linkUserId: linkUserId ?? null,
      } satisfies GoogleState,
      expiresAt: new Date(Date.now() + OAUTH_STATE_MINUTES * 60_000),
    })
    const params = new URLSearchParams({
      client_id: this.config.googleClientId!,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    })
    return { url: `${AUTHORIZE_URL}?${params}`, state }
  }

  async cancel(state: string, cookieState: string | undefined): Promise<GoogleState | null> {
    if (!cookieState || cookieState !== state) return null
    const stored = await this.authDBRepository.consumeToken(AuthTokenKind.GOOGLE_STATE, hashToken(state), new Date())
    return stored ? (JSON.parse(stored.payload ?? '{}') as GoogleState) : null
  }

  // Google sent the browser back: the state must be the cookie's and unused; the code becomes the profile
  async finish(
    code: string,
    state: string,
    cookieState: string | undefined,
  ): Promise<{ profile: GoogleProfile; state: GoogleState }> {
    if (!cookieState || cookieState !== state) throw new NotInvitedException({ reason: 'state_mismatch' })
    const stored = await this.authDBRepository.consumeToken(AuthTokenKind.GOOGLE_STATE, hashToken(state), new Date())
    if (!stored) throw new NotInvitedException({ reason: 'state_expired' })

    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.googleClientId!,
        client_secret: this.config.googleClientSecret!,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tokens = (await tokenResponse.json().catch(() => ({}))) as { access_token?: string }
    if (!tokenResponse.ok || !tokens.access_token) {
      this.logger.warn(`[finish] token exchange failed (${tokenResponse.status})`)
      throw new NotInvitedException({ reason: 'google_token' })
    }

    const info = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${tokens.access_token}` } })
    const profile = (await info.json().catch(() => ({}))) as {
      sub?: string
      email?: string
      email_verified?: boolean
      name?: string
    }
    // An unverified email proves nothing about who holds it
    if (!info.ok || !profile.sub || !profile.email || profile.email_verified !== true) {
      throw new NotInvitedException({ reason: 'google_profile' })
    }
    return {
      profile: {
        sub: profile.sub,
        email: profile.email.toLowerCase(),
        name: profile.name?.trim() || profile.email.split('@')[0],
      },
      state: JSON.parse(stored.payload ?? '{}') as GoogleState,
    }
  }
}
