import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ConfigService } from '@nestjs/config'

import { PrismaService } from '@/db/prisma/prisma.service'

import { NotionImporter } from './notion-importer'

// P14 (D90) on SQLite: the report, saving, importing again without duplicates, and RESET
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

  it('should report, save once, update on a second import and delete only what came from Notion', async () => {
    const plan = await importer.plan(dir)
    expect(plan.issues).toEqual([])
    expect(plan.expenses).toHaveLength(4)
    // Two identical rows are two rows: the occurrence keeps them apart
    expect(new Set(plan.expenses.map((expense) => expense.importKey)).size).toBe(4)
    expect(plan.months).toEqual([{ month: 9, year: 2031, spent: 2000, salary: 4000, surplus: 2000 }])

    expect(await importer.apply(plan)).toEqual({ created: 4, updated: 0, payments: 1, groups: 1, budgets: 1 })
    const paid = await prisma.debt.findFirst({ where: { personId, installment: '1/2' } })
    expect(paid).toMatchObject({ status: 'paid', paidAmount: 150 })
    expect(await prisma.monthlyBudget.findFirst({ where: { month: 9, year: 2031 } })).toMatchObject({
      salary: 4000,
      limitPercent: 90,
    })

    const again = await importer.plan(dir)
    expect(again.expenses.every((expense) => expense.exists)).toBe(true)
    expect(await importer.apply(again)).toMatchObject({ created: 0, updated: 4, payments: 0 })
    expect(await prisma.fixedCost.count({ where: { personId } })).toBe(2)
    expect(await prisma.debtPayment.count({ where: { debt: { personId } } })).toBe(1)

    expect(await importer.reset()).toMatchObject({ fixedCost: 2, debt: 2 })
    expect(await prisma.debt.count({ where: { personId } })).toBe(0)
  })

  it('should list the rows it cannot import instead of saving them', async () => {
    writeFileSync(join(dir, 'unknown.csv'), 'Columna\nvalor\n')
    const plan = await importer.plan(dir)
    expect(plan.issues).toContainEqual(expect.objectContaining({ file: 'unknown.csv', blocking: true }))
    rmSync(join(dir, 'unknown.csv'))
  })
})
