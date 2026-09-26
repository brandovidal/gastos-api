import { TENANT_EXCLUDED_MODELS, tenantStorage } from './tenant-context'

type Args = Record<string, any>

const READS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]
const WHERE_WRITES = ['update', 'updateMany', 'updateManyAndReturn', 'delete', 'deleteMany']

export class TenantContextMissingError extends Error {
  constructor(model: string, operation: string) {
    super(`${model}.${operation} ran without a user: wrap it in runWithUser (or runAsSystem for scripts) (P23)`)
    this.name = 'TenantContextMissingError'
  }
}

const withUser = (data: Args | Args[], userId: string) =>
  Array.isArray(data) ? data.map((row) => ({ ...row, userId })) : { ...data, userId }

// Rewrites the arguments of a query so it only sees, and only writes, the rows of the user in the context. It adds
// filters and values, never reads: a hook that queried would deadlock inside a transaction (P29, D122)
export function scopeArgs(operation: string, args: Args, userId: string): Args {
  if (READS.includes(operation)) return { ...args, where: { ...args.where, userId } }
  if (WHERE_WRITES.includes(operation)) {
    // Nobody moves a row to another user
    const { userId: _moved, ...data } = (args.data ?? {}) as Args
    return { ...args, where: { ...args.where, userId }, ...(args.data ? { data } : {}) }
  }
  if (operation === 'create') return { ...args, data: withUser(args.data, userId) }
  if (operation === 'createMany' || operation === 'createManyAndReturn')
    return { ...args, data: withUser(args.data, userId) }
  if (operation === 'upsert') {
    const { userId: _moved, ...update } = (args.update ?? {}) as Args
    return { ...args, where: { ...args.where, userId }, create: withUser(args.create, userId), update }
  }
  return args
}

// Every model with a userId is scoped through this (PrismaService applies it): exceptions in TENANT_EXCLUDED_MODELS
export const tenantExtension = {
  query: {
    $allModels: {
      async $allOperations({
        model,
        operation,
        args,
        query,
      }: {
        model: string
        operation: string
        args: Args
        query: (args: Args) => Promise<unknown>
      }) {
        const store = tenantStorage.getStore()
        if (TENANT_EXCLUDED_MODELS.has(model) || store?.system) return query(args)
        if (!store?.userId) throw new TenantContextMissingError(model, operation)
        return query(scopeArgs(operation, args, store.userId))
      },
    },
  },
}
