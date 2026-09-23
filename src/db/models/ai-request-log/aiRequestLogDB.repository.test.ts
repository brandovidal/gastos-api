import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { PrismaService } from '@/db/prisma/prisma.service'
import { AiOperation, AiProvider } from '@/commons/constants/ai.constant'

import { AiRequestLogDBRepository } from './aiRequestLogDB.repository'

const mockPrismaService = {
  aiRequestLog: {
    create: vi.fn(),
    count: vi.fn(),
  },
}

describe('AiRequestLogDBRepository', () => {
  let repository: AiRequestLogDBRepository

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiRequestLogDBRepository, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile()

    repository = module.get<AiRequestLogDBRepository>(AiRequestLogDBRepository)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should create a request log', async () => {
    const data = {
      provider: AiProvider.GEMINI,
      model: 'gemini-flash-lite',
      operation: AiOperation.EXTRACT,
      success: true,
      latencyMs: 820,
    }
    mockPrismaService.aiRequestLog.create.mockResolvedValue({ id: 'log-1', ...data })

    const result = await repository.create(data)

    expect(mockPrismaService.aiRequestLog.create).toHaveBeenCalledWith({ data })
    expect(result.id).toBe('log-1')
  })

  it('should count requests of a provider and model since a date', async () => {
    const since = new Date('2026-09-22T00:00:00.000Z')
    mockPrismaService.aiRequestLog.count.mockResolvedValue(17)

    const count = await repository.countSince(AiProvider.GEMINI, 'gemini-flash', since)

    expect(count).toBe(17)
    expect(mockPrismaService.aiRequestLog.count).toHaveBeenCalledWith({
      where: { provider: AiProvider.GEMINI, model: 'gemini-flash', createdAt: { gte: since } },
    })
  })
})
