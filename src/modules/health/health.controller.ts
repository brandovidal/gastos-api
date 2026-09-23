import { Controller, Get } from '@nestjs/common'

import { ResponseMessage } from '@/commons/decorators/response-message.decorator'
import { PrismaService } from '@/db/prisma/prisma.service'

@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  @ResponseMessage('HEALTH_SUCCESS', 'Service is healthy')
  async getHealth() {
    const database = (await this.prismaService.isHealthy()) ? 'OK' : 'DOWN'

    return {
      status: 'OK',
      database,
      timestamp: new Date().toISOString(),
    }
  }
}
