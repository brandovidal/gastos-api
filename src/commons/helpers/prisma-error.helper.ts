import { Prisma } from '@/generated/prisma/client'

import { PrismaErrorCode } from '../constants/database.constant'

// Remote Turso (libsql:// over HTTP) does not send SQLite extended codes, so the adapter reports a unique
// violation as the generic P2039 instead of P2002; only the driver message identifies it
const UNIQUE_CONSTRAINT_MESSAGE = 'UNIQUE constraint failed'

export const isPrismaError = (error: unknown, code: PrismaErrorCode): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code === code) return true
  return code === PrismaErrorCode.UNIQUE_CONSTRAINT && driverAdapterMessage(error).includes(UNIQUE_CONSTRAINT_MESSAGE)
}

function driverAdapterMessage(error: Prisma.PrismaClientKnownRequestError): string {
  const driverAdapterError = error.meta?.driverAdapterError as { cause?: { originalMessage?: unknown } } | undefined
  const message = driverAdapterError?.cause?.originalMessage
  return typeof message === 'string' ? message : ''
}
