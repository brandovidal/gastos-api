import { AiRequestLog } from '@/generated/prisma/client'

export type AiRequestLogDbDto = AiRequestLog

export type CreateAiRequestLogDbDto = Pick<AiRequestLog, 'provider' | 'model' | 'operation' | 'success' | 'latencyMs'> &
  Partial<Pick<AiRequestLog, 'expenseFileId' | 'errorCode' | 'inputTokens' | 'outputTokens'>>
