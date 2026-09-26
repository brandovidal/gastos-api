import { currentUserId, runAsSystem, runWithUser } from './tenant-context'
import { scopeArgs, tenantExtension, TenantContextMissingError } from './tenant.extension'

const hook = tenantExtension.query.$allModels.$allOperations

describe('scopeArgs', () => {
  it('should filter every read by the user, keeping the filters it had', () => {
    for (const operation of ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy']) {
      expect(scopeArgs(operation, { where: { id: 'a' } }, 'u1')).toEqual({ where: { id: 'a', userId: 'u1' } })
    }
    expect(scopeArgs('findMany', {}, 'u1')).toEqual({ where: { userId: 'u1' } })
  })

  it('should not let a filter of the query replace the user', () => {
    expect(scopeArgs('findMany', { where: { userId: 'someone-else' } }, 'u1')).toEqual({ where: { userId: 'u1' } })
  })

  it('should give every inserted row the user, one or many', () => {
    expect(scopeArgs('create', { data: { name: 'a' } }, 'u1')).toEqual({ data: { name: 'a', userId: 'u1' } })
    expect(scopeArgs('createMany', { data: [{ name: 'a' }, { name: 'b' }] }, 'u1')).toEqual({
      data: [
        { name: 'a', userId: 'u1' },
        { name: 'b', userId: 'u1' },
      ],
    })
    expect(scopeArgs('createManyAndReturn', { data: [{ name: 'a', userId: 'other' }] }, 'u1').data).toEqual([
      { name: 'a', userId: 'u1' },
    ])
  })

  it('should only update and delete rows of the user, and never move a row to another user', () => {
    expect(scopeArgs('update', { where: { id: 'a' }, data: { name: 'b', userId: 'thief' } }, 'u1')).toEqual({
      where: { id: 'a', userId: 'u1' },
      data: { name: 'b' },
    })
    expect(scopeArgs('deleteMany', { where: { name: 'a' } }, 'u1')).toEqual({ where: { name: 'a', userId: 'u1' } })
    expect(scopeArgs('updateMany', { where: {}, data: { name: 'b' } }, 'u1').where).toEqual({ userId: 'u1' })
  })

  it('should scope an upsert on its key, its insert and keep its update from moving the row', () => {
    expect(
      scopeArgs('upsert', { where: { id: 'a' }, create: { name: 'a' }, update: { name: 'b', userId: 'thief' } }, 'u1'),
    ).toEqual({ where: { id: 'a', userId: 'u1' }, create: { name: 'a', userId: 'u1' }, update: { name: 'b' } })
  })
})

describe('tenant extension', () => {
  const call = (model: string, operation: string, args: Record<string, unknown>) => {
    const query = vi.fn().mockResolvedValue('rows')
    return { query, result: hook({ model, operation, args, query }) }
  }

  it('should run the query of the user in the context with their filter', async () => {
    const { query, result } = await runWithUser('u1', async () =>
      call('FixedCost', 'findMany', { where: { paymentYear: 2026 } }),
    )

    expect(await result).toBe('rows')
    expect(query).toHaveBeenCalledWith({ where: { paymentYear: 2026, userId: 'u1' } })
  })

  it('should refuse a query without a user: a job that forgot to run per user must fail, not read everything', async () => {
    await expect(call('FixedCost', 'findMany', {}).result).rejects.toThrow(TenantContextMissingError)
  })

  it("should leave the tables that are not a user's alone: the users, their sessions and the AI quota", async () => {
    for (const model of ['AuthUser', 'AuthSession', 'AuthInvite', 'AuditContext', 'AiRequestLog']) {
      const { query, result } = call(model, 'findMany', { where: { id: 'a' } })
      await result
      expect(query).toHaveBeenCalledWith({ where: { id: 'a' } })
    }
  })

  it('should not filter in a system context (a script or a job of everyone)', async () => {
    const { query, result } = await runAsSystem(async () => call('FixedCost', 'findMany', { where: { id: 'a' } }))

    await result
    expect(query).toHaveBeenCalledWith({ where: { id: 'a' } })
  })
})

describe('the tenant context and lazy queries', () => {
  it('should run a lazy query in the context it was asked in, not where it is awaited', async () => {
    // A Prisma promise starts when it is awaited: the wrapper awaits it inside the context
    const lazy = () => ({ then: (resolve: (value: string | undefined) => void) => resolve(currentUserId()) })

    expect(await runWithUser('u1', () => lazy() as unknown as Promise<string | undefined>)).toBe('u1')
    expect(await runAsSystem(() => lazy() as unknown as Promise<string | undefined>)).toBeUndefined()
  })
})
