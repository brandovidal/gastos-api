import request from 'supertest'
import { vi } from 'vitest'

import { HttpStatus, INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'

import { VERSIONING_OPTIONS } from '@/commons/constants/versioning.constant'
import { PrismaService } from '@/db/prisma/prisma.service'
import { HealthController } from '@/modules/health/health.controller'
import { TelegramController } from '@/modules/telegram/telegram.controller'
import { TelegramService } from '@/modules/telegram/telegram.service'
import { RedisService } from '@/providers/redis/redis.service'
import { TelegramClient } from '@/providers/telegram/telegram.client'

// kogane-app and the Telegram webhook call these URLs by hand, so a route that moves out of /v1 is an outage.
describe('Route table', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController, TelegramController],
      providers: [
        { provide: PrismaService, useValue: { isHealthy: vi.fn().mockResolvedValue(true) } },
        { provide: TelegramClient, useValue: { getWebhookInfo: vi.fn() } },
        { provide: RedisService, useValue: { isHealthy: vi.fn().mockResolvedValue(null) } },
        { provide: TelegramService, useValue: { enqueue: vi.fn() } },
        { provide: ConfigService, useValue: new ConfigService({ telegram: { allowedChatIds: [] } }) },
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    app.enableVersioning(VERSIONING_OPTIONS)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should serve routes under the /v1 prefix', async () => {
    const response = await request(app.getHttpServer()).get('/v1/health')

    expect(response.status).toBe(HttpStatus.OK)
  })

  it('should not serve routes without the version prefix', async () => {
    const response = await request(app.getHttpServer()).get('/health')

    expect(response.status).toBe(HttpStatus.NOT_FOUND)
  })

  // Swagger at /docs is the reference for kogane-app (P7): every route must be listed with its response schema
  it('should document every route in Swagger with the response envelope', () => {
    const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, new DocumentBuilder().build()))

    expect(Object.keys(document.paths).sort()).toEqual(['/v1/health', '/v1/telegram/webhook'])
    expect(document.paths['/v1/health'].get?.tags).toEqual(['health'])
    expect(document.paths['/v1/telegram/webhook'].post?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'x-telegram-bot-api-secret-token', in: 'header' })]),
    )
    expect(JSON.stringify(document.components?.schemas)).toContain('pendingUpdates')
  })
})
