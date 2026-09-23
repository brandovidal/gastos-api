import { Prisma } from '@/generated/prisma/client'

import { PrismaErrorCode } from '../constants/database.constant'

export const isPrismaError = (error: unknown, code: PrismaErrorCode): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
