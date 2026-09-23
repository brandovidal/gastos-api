import { ConfigService } from '@nestjs/config'

import { PrismaService } from './prisma.service'

describe('PrismaService (integration)', () => {
  let prismaService: PrismaService

  beforeAll(async () => {
    const configService = new ConfigService({
      db: { url: process.env.DATABASE_URL ?? 'file:./test.db', authToken: process.env.DATABASE_AUTH_TOKEN },
    })

    prismaService = new PrismaService(configService)
    await prismaService.onModuleInit()
  })

  afterAll(async () => {
    await prismaService.onModuleDestroy()
  })

  it('should connect to the database', async () => {
    await expect(prismaService.isHealthy()).resolves.toBe(true)
  })
})
