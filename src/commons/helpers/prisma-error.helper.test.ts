import { describe, expect, it } from 'vitest'

import { Prisma } from '@/generated/prisma/client'

import { PrismaErrorCode } from '../constants/database.constant'
import { isPrismaError } from './prisma-error.helper'

const knownError = (code: string, originalMessage?: string) =>
  new Prisma.PrismaClientKnownRequestError('Database error', {
    code,
    clientVersion: 'test',
    meta: originalMessage ? { driverAdapterError: { cause: { originalMessage } } } : undefined,
  })

describe('isPrismaError', () => {
  it('matches the error code', () => {
    expect(isPrismaError(knownError('P2002'), PrismaErrorCode.UNIQUE_CONSTRAINT)).toBe(true)
    expect(isPrismaError(knownError('P2025'), PrismaErrorCode.RECORD_NOT_FOUND)).toBe(true)
    expect(isPrismaError(knownError('P2025'), PrismaErrorCode.UNIQUE_CONSTRAINT)).toBe(false)
  })

  it('detects a unique violation from remote Turso, reported without its specific code', () => {
    const tursoError = knownError(
      'P2039',
      'SQLITE_CONSTRAINT: SQLite error: UNIQUE constraint failed: bot_expense_drafts.channel',
    )

    expect(isPrismaError(tursoError, PrismaErrorCode.UNIQUE_CONSTRAINT)).toBe(true)
    expect(isPrismaError(tursoError, PrismaErrorCode.RECORD_NOT_FOUND)).toBe(false)
  })

  it('ignores other driver errors and non-Prisma errors', () => {
    expect(
      isPrismaError(knownError('P2039', 'SQLITE_BUSY: database is locked'), PrismaErrorCode.UNIQUE_CONSTRAINT),
    ).toBe(false)
    expect(isPrismaError(new Error('UNIQUE constraint failed'), PrismaErrorCode.UNIQUE_CONSTRAINT)).toBe(false)
  })
})
