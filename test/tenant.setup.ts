import { tenantStorage } from '../src/db/tenant/tenant-context'

// The integration tests are one user's: every table with a userId is filtered by it and every insert carries it (P23),
// like a request. A test about several users runs its parts with runWithUser
tenantStorage.enterWith({ userId: 'test-user' })
