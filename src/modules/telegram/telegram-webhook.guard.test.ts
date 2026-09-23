import { ExecutionContext } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { InvalidTelegramSecretException } from '@/commons/exceptions/telegram/invalid-telegram-secret.exception'

import { TelegramWebhookGuard } from './telegram-webhook.guard'

const contextWith = (headers: Record<string, string>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext

describe('TelegramWebhookGuard', () => {
  const guard = (webhookSecret?: string) =>
    new TelegramWebhookGuard(new ConfigService({ telegram: { webhookSecret, allowedChatIds: [] } }))

  it('should accept the secret configured in setWebhook', () => {
    expect(guard('s3cret').canActivate(contextWith({ 'x-telegram-bot-api-secret-token': 's3cret' }))).toBe(true)
  })

  it.each([
    ['a wrong secret', 's3cret', { 'x-telegram-bot-api-secret-token': 'nope' }],
    ['no header', 's3cret', {}],
    ['no secret configured', undefined, { 'x-telegram-bot-api-secret-token': '' }],
  ])('should reject %s', (_case, secret, headers) => {
    expect(() => guard(secret).canActivate(contextWith(headers))).toThrow(InvalidTelegramSecretException)
  })
})
