import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ConfigService } from '@nestjs/config'

import { ImportNotPreviewException } from '@/commons/exceptions/import/import-not-preview.exception'
import { PrismaService } from '@/db/prisma/prisma.service'

import { NotionImporter, readNotionDir } from './notion-importer'

// P14 (D90, D104) on SQLite: the report, the preview, applying it, importing again without duplicates, and RESET
describe('NotionImporter (integration)', () => {
  let prisma: PrismaService
  let importer: NotionImporter
  let dir: string
  let personId: string
  let categoryId: string
  let createdOwnerId: string | null = null
  const suffix = Date.now()
  const person = `Notion Person ${suffix}`
  const category = `Notion Category ${suffix}`
  const group = `Notion Group ${suffix}`

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ db: { url: process.env.DATABASE_URL ?? 'file:./test.db' } }))
    await prisma.onModuleInit()
    importer = new NotionImporter(prisma)
    // Inactive so the catalog refs of the conversation flows stay the same (they replay answers by position)
    personId = (await prisma.person.create({ data: { name: person, isActive: false } })).id
    categoryId = (await prisma.category.create({ data: { name: category } })).id
    if (!(await prisma.person.findFirst({ where: { isDefault: true } }))) {
      createdOwnerId = (
        await prisma.person.create({ data: { name: `Owner ${suffix}`, isDefault: true, isActive: false } })
      ).id
    }

    dir = mkdtempSync(join(tmpdir(), 'notion-'))
    writeFileSync(
      join(dir, '💵 Costos fijos 28dbcadcbe2081db98a0d60157fe9f2e_all.csv'),
      `\uFEFFDescripción,Año de pago,Categoria,Estado de pago,Mes de pago,Moneda,Pago,Persona\nAlquiler,2031,${category},Pagado,Setiembre,Soles(S/),"1,000.00",${person}\nAlquiler,2031,${category},Pagado,Setiembre,Soles(S/),"1,000.00",${person}\n`,
    )
    writeFileSync(
      join(dir, '💸 Cuentas abc_all.csv'),
      `Descripción,Año de pago,Cuota,Estado de pago,Fecha pago,Mes de pago,Pago,Persona\nPréstamo,2031,1/2,Pagado,20/09/2031,Setiembre,150,${person}\nPréstamo,2031,2/2,Pendiente,,Octubre,150,${person}\n`,
    )
    writeFileSync(join(dir, '💰 Relacion de gastos.csv'), `Nombre,Porcentaje (%)\n${group},12\n`)
    writeFileSync(join(dir, '💵 Resumen.csv'), 'Descripción,Sueldo,Porcentaje\nSetiembre 2031,4000,90%\n')
  })

  afterAll(async () => {
    await importer.reset()
    await prisma.budgetGroup.deleteMany({ where: { name: group } })
    await prisma.monthlyBudget.deleteMany({ where: { year: 2031 } })
    await prisma.category.delete({ where: { id: categoryId } })
    await prisma.person.delete({ where: { id: personId } })
    if (createdOwnerId) await prisma.person.delete({ where: { id: createdOwnerId } })
    await prisma.onModuleDestroy()
    rmSync(dir, { recursive: true, force: true })
  })

  const plan = async () => importer.plan(await readNotionDir(dir), dir)
  const previewAndApply = async () => importer.apply(await importer.preview(await plan()))

  it('should report, preview without writing, apply once, update on a second import and delete only what came from Notion', async () => {
    const first = await plan()
    expect(first.issues).toEqual([])
    expect(first.expenses).toHaveLength(4)
    // Two identical rows are two rows: the occurrence keeps them apart
    expect(new Set(first.expenses.map((expense) => expense.importKey)).size).toBe(4)
    expect(first.expenses.find((expense) => expense.table === 'fixedCost')?.destination).toBe(
      'Costos fijos · Setiembre 2031',
    )
    expect(first.months).toEqual([
      { month: 9, year: 2031, spent: 2000, salary: 4000, surplus: 2000, linked: 0, notionSpent: null },
    ])

    // The preview keeps every row with where it goes, and nothing in the expenses
    const batchId = await importer.preview(first)
    expect(await prisma.importBatch.findUnique({ where: { id: batchId } })).toMatchObject({
      status: 'preview',
      created: 4,
    })
    expect(await prisma.importRow.count({ where: { batchId } })).toBe(4 + 1 + 1) // expenses, group, salary
    expect(await prisma.fixedCost.count({ where: { personId } })).toBe(0)

    expect(await importer.apply(batchId)).toMatchObject({
      created: 4,
      updated: 0,
      unchanged: 0,
      payments: 1,
      groups: 1,
      budgets: 1,
    })
    await expect(importer.apply(batchId)).rejects.toThrow(ImportNotPreviewException)
    const paid = await prisma.debt.findFirst({ where: { personId, installment: '1/2' } })
    expect(paid).toMatchObject({ status: 'paid', paidAmount: 150 })
    expect(await prisma.monthlyBudget.findFirst({ where: { month: 9, year: 2031 } })).toMatchObject({
      salary: 4000,
      limitPercent: 90,
    })
    // Every imported row keeps its CSV row and points to the Kogane row it became
    const saved = await prisma.importRow.findMany({ where: { batchId, kind: 'expense' } })
    expect(saved.every((row) => row.targetId)).toBe(true)
    const debtRow = saved.find((row) => row.targetTable === 'debt')!
    expect(JSON.parse(debtRow.raw)).toMatchObject({ Descripción: 'Préstamo' })
    expect(await prisma.debt.findUnique({ where: { id: debtRow.targetId! } })).toMatchObject({
      importKey: debtRow.importKey,
    })

    // The same export again: nothing is touched, so an edit made in Kogane stays
    const rent = await prisma.fixedCost.findFirst({ where: { personId } })
    await prisma.fixedCost.update({ where: { id: rent!.id }, data: { notes: 'editado en Kogane' } })
    const again = await plan()
    expect(again.expenses.every((expense) => expense.status === 'unchanged')).toBe(true)
    expect(await previewAndApply()).toMatchObject({ created: 0, updated: 0, unchanged: 4, payments: 0 })
    expect(await prisma.fixedCost.findUnique({ where: { id: rent!.id } })).toMatchObject({ notes: 'editado en Kogane' })
    expect(await prisma.fixedCost.count({ where: { personId } })).toBe(2)

    // The second installment was paid in Notion: same row (same key), different CSV → updated and paid once
    writeFileSync(
      join(dir, '💸 Cuentas abc_all.csv'),
      `Descripción,Año de pago,Cuota,Estado de pago,Fecha pago,Mes de pago,Pago,Persona\nPréstamo,2031,1/2,Pagado,20/09/2031,Setiembre,150,${person}\nPréstamo,2031,2/2,Pagado,20/10/2031,Octubre,150,${person}\n`,
    )
    const changed = await plan()
    expect(changed.expenses.filter((expense) => expense.status === 'changed')).toHaveLength(1)
    expect(await previewAndApply()).toMatchObject({ created: 0, updated: 1, unchanged: 3, payments: 1 })
    expect(await prisma.debtPayment.count({ where: { debt: { personId } } })).toBe(2)

    expect(await importer.reset()).toMatchObject({ fixedCost: 2, debt: 2 })
    expect(await prisma.importBatch.count({ where: { id: batchId } })).toBe(0)
    expect(await prisma.debt.count({ where: { personId } })).toBe(0)
  })

  it('should discard a preview and leave out the files that are not one of the boards', async () => {
    writeFileSync(join(dir, 'BCP 28dbcadcbe2081769d14ff75d1ca6fe6_all.csv'), 'Columna\nvalor\n')
    const withOther = await plan()
    expect(withOther.issues).toContainEqual(
      expect.objectContaining({ file: 'BCP 28dbcadcbe2081769d14ff75d1ca6fe6_all.csv', blocking: false }),
    )
    const batchId = await importer.preview(withOther)
    await importer.discard(batchId)
    expect(await prisma.importBatch.count({ where: { id: batchId } })).toBe(0)
    expect(await prisma.importRow.count({ where: { batchId } })).toBe(0)
    await expect(importer.discard(batchId)).rejects.toThrow(ImportNotPreviewException)
    rmSync(join(dir, 'BCP 28dbcadcbe2081769d14ff75d1ca6fe6_all.csv'))
  })
})
