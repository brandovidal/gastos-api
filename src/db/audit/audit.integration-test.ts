import { ConfigService } from '@nestjs/config'

import { AUDITED_TABLES, AuditAction, AuditSource } from '@/commons/constants/audit.constant'
import { PaymentStatus } from '@/commons/constants/expense.constant'
import { DebtDirection } from '@/commons/constants/debt.constant'
import { AuditChangeDBRepository } from '@/db/models/audit/auditChangeDB.repository'
import { PrismaService } from '@/db/prisma/prisma.service'
import { HistoryService } from '@/modules/history/history.service'

import { runAsImport, setAuditContext } from './audit-context'
import { AuditedTable, buildAuditTriggers, normalizeTriggerSql } from './audit-triggers'

const PERSON = 'Audit Person'
const CATEGORY = 'Audit Category'

// P29 against SQLite: the triggers are what the app relies on, so they are tested as the database has them
describe('History triggers (integration)', () => {
  let prisma: PrismaService
  let history: HistoryService
  let personId: string
  let categoryId: string
  const entityIds: string[] = []

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ db: { url: process.env.DATABASE_URL ?? 'file:./test.db' } }))
    await prisma.onModuleInit()
    history = new HistoryService(new AuditChangeDBRepository(prisma))
    await setAuditContext(prisma, AuditSource.CLI)
    personId = (await prisma.person.create({ data: { name: PERSON, isActive: false } })).id
    categoryId = (await prisma.category.create({ data: { name: CATEGORY } })).id
  })

  afterAll(async () => {
    await prisma.debt.deleteMany({ where: { personId } })
    await prisma.fixedCost.deleteMany({ where: { personId } })
    await prisma.category.delete({ where: { id: categoryId } })
    await prisma.person.delete({ where: { id: personId } })
    await prisma.auditChange.deleteMany({
      where: {
        OR: [
          { entityId: { in: [...entityIds, personId, categoryId] } },
          { entity: 'imp_batches', entityId: 'audit-test' },
        ],
      },
    })
    await setAuditContext(prisma, AuditSource.CLI)
    await prisma.onModuleDestroy()
  })

  const fixedCost = async (description: string, amount = 1000) => {
    const row = await prisma.fixedCost.create({
      data: { description, amount, personId, categoryId, paymentMonth: 9, paymentYear: 2031 },
    })
    entityIds.push(row.id)
    return row
  }

  it('should have exactly the triggers the columns of the database ask for (a new column needs make audit-triggers)', async () => {
    const tables: AuditedTable[] = []
    for (const table of AUDITED_TABLES) {
      const columns = await prisma.$queryRawUnsafe<{ name: string; pk: number }[]>(
        `SELECT name, pk FROM pragma_table_info('${table}') ORDER BY cid`,
      )
      tables.push({
        table,
        idColumn: columns.find((column) => column.pk === 1)!.name,
        columns: columns.map((column) => column.name),
      })
    }
    const existing = await prisma.$queryRawUnsafe<{ name: string; sql: string }[]>(
      "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'aud\\_%' ESCAPE '\\'",
    )

    const expected = buildAuditTriggers(tables)

    expect(existing.map((trigger) => trigger.name).sort()).toEqual(expected.map((trigger) => trigger.name).sort())
    for (const trigger of expected) {
      const stored = existing.find((row) => row.name === trigger.name)!
      expect(normalizeTriggerSql(stored.sql), trigger.name).toBe(normalizeTriggerSql(trigger.sql))
    }
  })

  it('should show an edit from the web and a payment from the bot on the timeline of that expense', async () => {
    await setAuditContext(prisma, AuditSource.WEB)
    const row = await fixedCost('Terreno audit')
    await prisma.fixedCost.update({ where: { id: row.id }, data: { amount: 1042 } })
    await setAuditContext(prisma, AuditSource.BOT)
    await prisma.fixedCost.update({ where: { id: row.id }, data: { paymentStatus: PaymentStatus.PAID } })

    const { items, labels } = await history.timeline('exp_fixed_costs', row.id)

    expect(items.map((item) => [item.action, item.source])).toEqual([
      ['update', 'bot'],
      ['update', 'web'],
      ['create', 'web'],
    ])
    expect(items[0].changes).toEqual([{ field: 'paymentStatus', before: 'not_started', after: 'paid' }])
    expect(items[1].changes).toEqual([{ field: 'amount', before: 1000, after: 1042 }])
    expect(items[0].title).toBe('Terreno audit')
    // the person of the create is named, not just an id
    expect(labels[personId]).toBe(PERSON)
  })

  it('should keep the whole row of a deleted debt, with its name', async () => {
    await setAuditContext(prisma, AuditSource.WEB)
    const debt = await prisma.debt.create({
      data: {
        direction: DebtDirection.OWED_TO_ME,
        description: 'Zapatillas audit',
        amount: 150,
        personId,
        paymentMonth: 9,
        paymentYear: 2031,
      },
    })
    entityIds.push(debt.id)
    await prisma.debt.delete({ where: { id: debt.id } })

    const [deleted] = (await history.timeline('exp_debts', debt.id)).items

    expect(deleted).toEqual(
      expect.objectContaining({ action: AuditAction.DELETE, title: 'Zapatillas audit', source: 'web' }),
    )
    expect(deleted.changes).toEqual(
      expect.arrayContaining([
        { field: 'description', before: 'Zapatillas audit', after: null },
        { field: 'amount', before: 150, after: null },
      ]),
    )
  })

  it('should record bulk changes and changes inside a transaction', async () => {
    await setAuditContext(prisma, AuditSource.WEB)
    const [a, b] = [await fixedCost('Bulk A'), await fixedCost('Bulk B')]

    await prisma.$transaction(async (tx) => {
      await tx.fixedCost.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { amount: 5 } })
    })

    for (const row of [a, b]) {
      const [latest] = (await history.timeline('exp_fixed_costs', row.id)).items
      expect(latest.changes).toEqual([{ field: 'amount', before: 1000, after: 5 }])
    }
  })

  it('should not count updatedAt alone as a change', async () => {
    await setAuditContext(prisma, AuditSource.WEB)
    const row = await fixedCost('Touched')

    await prisma.$executeRawUnsafe(
      `UPDATE "exp_fixed_costs" SET "updatedAt" = '2031-01-01T00:00:00.000+00:00' WHERE "id" = ?`,
      row.id,
    )

    expect((await history.timeline('exp_fixed_costs', row.id)).total).toBe(1) // only the create
  })

  it('should leave one event for an import instead of a row per record', async () => {
    const created = await runAsImport(
      prisma,
      { entity: 'imp_batches', entityId: 'audit-test', action: AuditAction.CREATE },
      async () => {
        const rows = [await fixedCost('Import A'), await fixedCost('Import B'), await fixedCost('Import C')]
        await prisma.fixedCost.update({ where: { id: rows[0].id }, data: { amount: 7 } })
        return { created: rows.length, ids: rows.map((row) => row.id) }
      },
    )

    for (const id of created.ids) expect((await history.timeline('exp_fixed_costs', id)).total).toBe(0)
    const [event] = (await history.timeline('imp_batches', 'audit-test')).items
    expect(event).toEqual(expect.objectContaining({ source: 'import', batchId: 'audit-test', action: 'create' }))
    expect(event.changes).toEqual(expect.arrayContaining([{ field: 'created', before: null, after: 3 }]))
    // and the writes that follow are recorded again
    const after = await fixedCost('After the import')
    expect((await history.timeline('exp_fixed_costs', after.id)).total).toBe(1)
  })

  it('should show that the document number changed without showing it', async () => {
    await setAuditContext(prisma, AuditSource.WEB)
    await prisma.person.update({ where: { id: personId }, data: { documentNumber: '87654321' } })
    await prisma.person.update({ where: { id: personId }, data: { documentNumber: '11223344' } })

    const { items } = await history.timeline('cat_people', personId)
    const serialized = JSON.stringify(items)

    expect(items[0].changes).toEqual([{ field: 'documentNumber', before: '•••', after: '•••' }])
    expect(items[1].changes).toEqual([{ field: 'documentNumber', before: null, after: '•••' }])
    expect(serialized).not.toContain('87654321')
    expect(serialized).not.toContain('11223344')
    // not even the snapshot of a create or a delete carries it
    const raw = await prisma.auditChange.findMany({ where: { entity: 'cat_people', entityId: personId } })
    expect(JSON.stringify(raw)).not.toMatch(/8765|1122/)
  })
})
