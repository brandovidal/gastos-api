import { ConfigService } from '@nestjs/config'

import { PrismaService } from './prisma.service'

import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { ExpenseType, PaymentStatus, ReceivableStatus, SubscriptionPeriod } from '@/commons/constants/expense.constant'

describe('Prisma schema (integration)', () => {
  let prisma: PrismaService

  beforeAll(async () => {
    const configService = new ConfigService({ db: { url: process.env.DATABASE_URL ?? 'file:./test.db' } })

    prisma = new PrismaService(configService)
    await prisma.onModuleInit()
  })

  afterAll(async () => {
    await prisma.onModuleDestroy()
  })

  it('should create catalogs and one expense per table with unified fields', async () => {
    const person = await prisma.person.create({ data: { name: 'Test Person', aliases: JSON.stringify(['tp']) } })
    const category = await prisma.category.create({ data: { name: 'Test Category' } })
    const creditCard = await prisma.creditCard.create({
      data: { code: 'TST', name: 'Test Card', billingCloseDay: 20, paymentDueDay: 5 },
    })
    const wallet = await prisma.paymentMethod.create({ data: { name: 'Test Wallet', type: PaymentMethodType.WALLET } })
    const cardMethod = await prisma.paymentMethod.create({
      data: { name: 'Test Card Method', type: PaymentMethodType.CREDIT_CARD, creditCardId: creditCard.id },
    })

    const base = { amount: 50, personId: person.id, paymentMonth: 9, paymentYear: 2026 }

    const fixedCost = await prisma.fixedCost.create({
      data: { ...base, description: 'Rent', categoryId: category.id, paymentMethodId: wallet.id },
    })
    const subscription = await prisma.subscription.create({
      data: { ...base, description: 'Streaming', period: SubscriptionPeriod.MONTHLY },
    })
    const cardExpense = await prisma.creditCardExpense.create({
      data: { ...base, description: 'Laptop', creditCardId: creditCard.id, installment: '2/6' },
    })
    const receivable = await prisma.accountReceivable.create({
      data: { description: 'Loan', amount: 100, personId: person.id },
    })

    expect(fixedCost.expenseType).toBe(ExpenseType.ESSENTIAL)
    expect(fixedCost.paymentStatus).toBe(PaymentStatus.NOT_STARTED)
    expect(fixedCost.currency).toBe('PEN')
    expect(subscription.categoryId).toBeNull()
    expect(cardExpense.paymentStatus).toBe(PaymentStatus.PENDING)
    expect(receivable.status).toBe(ReceivableStatus.PENDING)

    const card = await prisma.creditCard.findUniqueOrThrow({
      where: { id: creditCard.id },
      include: { paymentMethod: true, expenses: true },
    })

    expect(card.paymentMethod?.id).toBe(cardMethod.id)
    expect(card.expenses).toHaveLength(1)
  })

  it('should reject a payment method already linked to the same credit card', async () => {
    const creditCard = await prisma.creditCard.create({
      data: { code: 'DUP', name: 'Dup Card', billingCloseDay: 1, paymentDueDay: 15 },
    })
    await prisma.paymentMethod.create({
      data: { name: 'Dup A', type: PaymentMethodType.CREDIT_CARD, creditCardId: creditCard.id },
    })

    await expect(
      prisma.paymentMethod.create({
        data: { name: 'Dup B', type: PaymentMethodType.CREDIT_CARD, creditCardId: creditCard.id },
      }),
    ).rejects.toThrow()
  })
})
