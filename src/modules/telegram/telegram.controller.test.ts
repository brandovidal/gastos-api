import request from 'supertest'
import { vi } from 'vitest'

import { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'

import { VERSIONING_OPTIONS } from '@/commons/constants/versioning.constant'

import { TelegramController } from './telegram.controller'
import { TelegramService } from './telegram.service'
import { TelegramWebhookGuard } from './telegram-webhook.guard'

const mockTelegramService = { enqueue: vi.fn() }

describe('TelegramController', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TelegramController],
      providers: [
        TelegramWebhookGuard,
        { provide: TelegramService, useValue: mockTelegramService },
        { provide: ConfigService, useValue: new ConfigService({ telegram: { webhookSecret: 's3cret' } }) },
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    app.enableVersioning(VERSIONING_OPTIONS)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should accept updates with the secret at /v1/telegram/webhook and answer 200 without waiting', async () => {
    mockTelegramService.enqueue.mockReturnValue(new Promise(() => undefined)) // never resolves

    const response = await request(app.getHttpServer())
      .post('/v1/telegram/webhook')
      .set('x-telegram-bot-api-secret-token', 's3cret')
      .send({ update_id: 1 })

    expect(response.status).toBe(200)
    expect(mockTelegramService.enqueue).toHaveBeenCalledWith({ update_id: 1 })
  })

  it('should reject requests without the secret', async () => {
    const response = await request(app.getHttpServer()).post('/v1/telegram/webhook').send({ update_id: 1 })

    expect(response.status).toBe(401)
    expect(mockTelegramService.enqueue).not.toHaveBeenCalled()
  })
})
