import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'
import { AiProvider } from '@/commons/constants/ai.constant'

import { AiRequestLogDbDto, CreateAiRequestLogDbDto } from './aiRequestLogDB.dto'

@Injectable()
export class AiRequestLogDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAiRequestLogDbDto): Promise<AiRequestLogDbDto> {
    return this.prisma.aiRequestLog.create({ data })
  }

  // Free tiers limit requests per day and model, failed requests included
  async countSince(provider: AiProvider, model: string, since: Date): Promise<number> {
    return this.prisma.aiRequestLog.count({ where: { provider, model, createdAt: { gte: since } } })
  }
}
