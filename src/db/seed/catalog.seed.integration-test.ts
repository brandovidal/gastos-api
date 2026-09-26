import { ConfigService } from '@nestjs/config'

import { PrismaService } from '@/db/prisma/prisma.service'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { JsonHelper } from '@/commons/helpers/json.helper'

import { seedCatalogs } from './catalog.seed'
import { CATEGORIES, PAYMENT_METHODS, PEOPLE } from './catalog.seed.data'

// The user of the integration tests (test/tenant.setup.ts)
const USER = 'test-user'

describe('seedCatalogs (integration)', () => {
  let prisma: PrismaService

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ db: { url: process.env.DATABASE_URL ?? 'file:./test.db' } }))
    await prisma.onModuleInit()
  })

  afterAll(async () => {
    await prisma.onModuleDestroy()
  })

  it('should load every catalog and be safe to run twice', async () => {
    await seedCatalogs(prisma, USER)
    await seedCatalogs(prisma, USER)

    const names = (rows: { name: string }[]) => rows.map((row) => row.name)

    expect(await prisma.person.count({ where: { name: { in: names(PEOPLE) } } })).toBe(PEOPLE.length)
    expect(await prisma.paymentMethod.count({ where: { name: { in: names(PAYMENT_METHODS) } } })).toBe(
      PAYMENT_METHODS.length,
    )
    expect(await prisma.category.count({ where: { name: { in: names(CATEGORIES) } } })).toBe(CATEGORIES.length)
  })

  it('should mark Brando as the default person with his aliases', async () => {
    const brando = await prisma.person.findUniqueOrThrow({ where: { userId_name: { userId: USER, name: 'Brando' } } })

    expect(brando.isDefault).toBe(true)
    expect(JsonHelper.parseArray(brando.aliases)).toEqual(['yo', 'yuji'])
  })

  it('should keep credit cards as payment methods with their billing days, and Efectivo as cash', async () => {
    const ohPay = await prisma.paymentMethod.findUniqueOrThrow({
      where: { userId_name: { userId: USER, name: 'Oh Pay' } },
    })
    const cash = await prisma.paymentMethod.findUniqueOrThrow({
      where: { userId_name: { userId: USER, name: 'Efectivo' } },
    })
    const food = await prisma.category.findUniqueOrThrow({
      where: { userId_name: { userId: USER, name: 'Comida' } },
      include: { budgetGroup: true },
    })

    expect(ohPay).toMatchObject({
      type: PaymentMethodType.CREDIT_CARD,
      code: 'OH',
      billingCloseDay: 10,
      paymentDueDay: 3,
      showInBot: true,
    })
    expect(cash).toMatchObject({ type: PaymentMethodType.CASH, code: null, billingCloseDay: null })
    expect(food.budgetGroup?.name).toBe('Gastos sin culpa')
  })
})
