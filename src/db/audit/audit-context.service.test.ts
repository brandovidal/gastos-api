import { CallHandler, ExecutionContext } from '@nestjs/common'
import { of } from 'rxjs'
import { vi } from 'vitest'

import { AuditSource } from '@/commons/constants/audit.constant'

import { AuditContextInterceptor, AuditContextService } from './audit-context.service'

const mockPrisma = { auditContext: { upsert: vi.fn() } }
const handler = () => undefined
const next: CallHandler = { handle: () => of('ok') }

const contextOf = (method: string, path: string, actorId?: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ method, path, actorId }) }),
    getHandler: () => handler,
    getClass: () => class {},
  }) as unknown as ExecutionContext

describe('AuditContextService', () => {
  const service = new AuditContextService(mockPrisma as never)

  afterEach(() => vi.resetAllMocks())

  it('should set the source of the writes that follow', async () => {
    await service.enter(AuditSource.BOT)

    expect(mockPrisma.auditContext.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { source: 'bot', batchId: null, actorId: null } }),
    )
  })

  it('should never fail the work when the context cannot be written', async () => {
    mockPrisma.auditContext.upsert.mockRejectedValue(new Error('database is locked'))

    await expect(service.enter(AuditSource.WEB)).resolves.toBeUndefined()
  })
})

describe('AuditContextInterceptor', () => {
  const enter = vi.fn().mockResolvedValue(undefined)
  const interceptor = new AuditContextInterceptor({ enter } as unknown as AuditContextService)

  afterEach(() => vi.clearAllMocks())

  it('should mark a change through the API as web', async () => {
    await interceptor.intercept(contextOf('PATCH', '/v1/expenses/fixed-costs/1'), next)

    expect(enter).toHaveBeenCalledWith(AuditSource.WEB, { actorId: undefined })
  })

  it('should say who made the change: the superadmin, when they entered as another user (P23)', async () => {
    const signedIn = contextOf('PATCH', '/v1/expenses/fixed-costs/1', 'superadmin-1')

    await interceptor.intercept(signedIn, next)

    expect(enter).toHaveBeenCalledWith(AuditSource.WEB, { actorId: 'superadmin-1' })
  })

  it('should not touch the database on a read', async () => {
    await interceptor.intercept(contextOf('GET', '/v1/expenses/fixed-costs'), next)

    expect(enter).not.toHaveBeenCalled()
  })

  it('should leave the Telegram webhook to the bot, which sets its own source when it processes the update', async () => {
    await interceptor.intercept(contextOf('POST', '/telegram/webhook'), next)

    expect(enter).not.toHaveBeenCalled()
  })
})
