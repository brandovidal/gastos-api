import request from 'supertest'
import { vi } from 'vitest'

import { HttpStatus, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'

import { VERSIONING_OPTIONS } from '@/commons/constants/versioning.constant'
import { PrismaService } from '@/db/prisma/prisma.service'
import { HealthController } from '@/modules/health/health.controller'

// kogane-app and the Telegram webhook call these URLs by hand, so a route that moves out of /v1 is an outage.
describe('Route table', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { isHealthy: vi.fn().mockResolvedValue(true) } }],
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
})
