import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { WebhookStatus } from '@/commons/constants/telegram.constant'
import { PrismaService } from '@/db/prisma/prisma.service'
import { TelegramClient } from '@/providers/telegram/telegram.client'

import { HealthController } from './health.controller'
import { healthSchema } from './validations/health.validation'

const mockPrismaService = {
  isHealthy: vi.fn(),
}
const mockTelegramClient = {
  getWebhookInfo: vi.fn(),
}

describe('HealthController', () => {
  const build = async (botToken?: string) => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TelegramClient, useValue: mockTelegramClient },
        { provide: ConfigService, useValue: new ConfigService({ telegram: { botToken, allowedChatIds: [] } }) },
      ],
    }).compile()

    return app.get<HealthController>(HealthController)
  }

  beforeEach(() => {
    mockPrismaService.isHealthy.mockResolvedValue(true)
    mockTelegramClient.getWebhookInfo.mockResolvedValue({
      url: 'https://x/v1/telegram/webhook',
      pending_update_count: 0,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getHealth', () => {
    it('should report the database and the webhook as OK, matching the documented schema', async () => {
      const response = await (await build('123:abc')).getHealth()

      expect(response.database).toBe('OK')
      expect(response.telegram).toEqual({ webhook: 'OK', pendingUpdates: 0, lastError: null, lastErrorAt: null })
      expect(healthSchema.safeParse(response).success).toBe(true)
    })

    it('should report the database as DOWN when it fails', async () => {
      mockPrismaService.isHealthy.mockResolvedValue(false)

      const response = await (await build('123:abc')).getHealth()

      expect(response.status).toBe('OK')
      expect(response.database).toBe('DOWN')
    })

    it('should report a recent delivery error and the pending updates', async () => {
      mockTelegramClient.getWebhookInfo.mockResolvedValue({
        url: 'https://x/v1/telegram/webhook',
        pending_update_count: 3,
        last_error_date: Math.floor(Date.now() / 1000) - 60,
        last_error_message: 'Connection refused',
      })

      const { telegram } = await (await build('123:abc')).getHealth()

      expect(telegram).toMatchObject({
        webhook: WebhookStatus.ERROR,
        pendingUpdates: 3,
        lastError: 'Connection refused',
      })
    })

    it('should treat an old delivery error as OK, and a missing URL as NOT_SET', async () => {
      mockTelegramClient.getWebhookInfo.mockResolvedValueOnce({
        url: 'https://x/v1/telegram/webhook',
        pending_update_count: 0,
        last_error_date: Math.floor(Date.now() / 1000) - 2 * 3600,
        last_error_message: 'Connection refused',
      })
      const controller = await build('123:abc')

      expect((await controller.getHealth()).telegram.webhook).toBe(WebhookStatus.OK)

      mockTelegramClient.getWebhookInfo.mockResolvedValueOnce({ url: '', pending_update_count: 0 })
      expect((await controller.getHealth()).telegram.webhook).toBe(WebhookStatus.NOT_SET)
    })

    it('should not call Telegram without a bot token, and survive when Telegram fails', async () => {
      expect((await (await build()).getHealth()).telegram.webhook).toBe(WebhookStatus.NOT_CONFIGURED)
      expect(mockTelegramClient.getWebhookInfo).not.toHaveBeenCalled()

      mockTelegramClient.getWebhookInfo.mockRejectedValue(new Error('timeout'))
      expect((await (await build('123:abc')).getHealth()).telegram.webhook).toBe(WebhookStatus.UNAVAILABLE)
    })
  })
})
