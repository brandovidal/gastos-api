import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { HealthController } from './health.controller'
import { PrismaService } from '@/db/prisma/prisma.service'

const mockPrismaService = {
  isHealthy: vi.fn(),
}

describe('HealthController', () => {
  let healthController: HealthController

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: mockPrismaService }],
    }).compile()

    healthController = app.get<HealthController>(HealthController)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getHealth', () => {
    it('should report the database as OK when it responds', async () => {
      mockPrismaService.isHealthy.mockResolvedValue(true)

      const response = await healthController.getHealth()

      expect(response.status).toBe('OK')
      expect(response.database).toBe('OK')
      expect(response.timestamp).toBeDefined()
    })

    it('should report the database as DOWN when it fails', async () => {
      mockPrismaService.isHealthy.mockResolvedValue(false)

      const response = await healthController.getHealth()

      expect(response.status).toBe('OK')
      expect(response.database).toBe('DOWN')
    })
  })
})
