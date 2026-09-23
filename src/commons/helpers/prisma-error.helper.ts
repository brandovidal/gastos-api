import { Prisma } from '@/generated/prisma/client'

import { PrismaErrorCode } from '../constants/database.constant'

// Remote Turso (libsql:// over HTTP) does not send SQLite extended codes, so the adapter reports a unique
// violation as the generic P2039 instead of P2002; only the driver message identifies it
// (same for foreign keys)
const DRIVER_MESSAGES: Partial<Record<PrismaErrorCode, string>> = {
  [PrismaErrorCode.UNIQUE_CONSTRAINT]: 'UNIQUE constraint failed',
  [PrismaErrorCode.FOREIGN_KEY_CONSTRAINT]: 'FOREIGN KEY constraint failed',
}

export const isPrismaError = (error: unknown, code: PrismaErrorCode): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code === code) return true
  const message = DRIVER_MESSAGES[code]
  return message !== undefined && driverAdapterMessage(error).includes(message)
}

function driverAdapterMessage(error: Prisma.PrismaClientKnownRequestError): string {
  const driverAdapterError = error.meta?.driverAdapterError as { cause?: { originalMessage?: unknown } } | undefined
  const message = driverAdapterError?.cause?.originalMessage
  return typeof message === 'string' ? message : ''
}
