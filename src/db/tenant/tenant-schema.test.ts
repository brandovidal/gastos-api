import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { TENANT_EXCLUDED_MODELS } from './tenant-context'

// The tenancy extension filters by userId on every model except TENANT_EXCLUDED_MODELS: a model with the column that
// is excluded, or without it and not excluded, would leak or fail (P23, D82)
describe('schema and tenancy', () => {
  const schema = readFileSync(join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'), 'utf8')
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, name, body]) => ({
    name,
    hasUserId: /^\s+userId\s+String\??\s/m.test(body),
  }))

  it("should have a userId in every model that is a user's", () => {
    const missing = models
      .filter((model) => !model.hasUserId && !TENANT_EXCLUDED_MODELS.has(model.name))
      .map((model) => model.name)

    expect(missing).toEqual([])
  })

  it("should exclude only models that really are not a user's", () => {
    const excludedWithUserId = models
      // (the auth_ tables have a userId of their own: whose session or code it is)
      .filter((model) => model.hasUserId && TENANT_EXCLUDED_MODELS.has(model.name) && !model.name.startsWith('Auth'))
      .map((model) => model.name)

    expect(excludedWithUserId).toEqual([])
    expect([...TENANT_EXCLUDED_MODELS].filter((name) => !models.some((model) => model.name === name))).toEqual([])
  })
})
