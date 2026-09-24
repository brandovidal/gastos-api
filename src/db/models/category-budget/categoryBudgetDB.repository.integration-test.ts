import { ConfigService } from '@nestjs/config'

import { CategoryBudgetNotFoundException } from '@/commons/exceptions/budget/category-budget-not-found.exception'
import { ExpenseDestination } from '@/commons/constants/expense.constant'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { PrismaService } from '@/db/prisma/prisma.service'

import { CategoryBudgetDBRepository } from './categoryBudgetDB.repository'

// Budget (P19) on SQLite: the general limit (month null) and the limit of one month, and spending per category
describe('CategoryBudgetDBRepository (integration)', () => {
  let prisma: PrismaService
  let repository: CategoryBudgetDBRepository
  let expenses: ExpenseDBRepository
  let categoryId: string
  let personId: string
  let paymentMethodId: string
  const suffix = Date.now()

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ db: { url: process.env.DATABASE_URL ?? 'file:./test.db' } }))
    await prisma.onModuleInit()
    repository = new CategoryBudgetDBRepository(prisma)
    expenses = new ExpenseDBRepository(prisma)
    categoryId = (await prisma.category.create({ data: { name: `Budget Category ${suffix}` } })).id
    personId = (await prisma.person.create({ data: { name: `Budget Person ${suffix}` } })).id
    paymentMethodId = (
      await prisma.paymentMethod.create({
        data: { name: `Budget Card ${suffix}`, type: 'credit_card', isActive: false },
      })
    ).id
  })

  afterAll(async () => {
    // Out of the catalog again: conversation flows replay AI answers that point to catalog refs by position
    await prisma.categoryBudget.deleteMany({ where: { categoryId } })
    await prisma.debt.deleteMany({ where: { personId } })
    await prisma.creditCardExpense.deleteMany({ where: { personId } })
    await prisma.dailyExpense.deleteMany({ where: { personId } })
    await prisma.expenseDraft.deleteMany({ where: { personId } })
    await prisma.paymentMethod.delete({ where: { id: paymentMethodId } })
    await prisma.person.delete({ where: { id: personId } })
    await prisma.category.delete({ where: { id: categoryId } })
    await prisma.onModuleDestroy()
  })

  it('should keep one general limit (updated, not duplicated) and let a month replace it', async () => {
    await repository.upsert({ categoryId, monthlyLimit: 400 })
    await repository.upsert({ categoryId, monthlyLimit: 500, alertThreshold: 70 })
    await repository.upsert({ categoryId, monthlyLimit: 800, month: 12, year: 2032 })

    expect(await prisma.categoryBudget.count({ where: { categoryId } })).toBe(2)
    const [general] = (await repository.findEffective(11, 2032)).filter((row) => row.categoryId === categoryId)
    expect(general).toMatchObject({ monthlyLimit: 500, alertThreshold: 70, month: null })
    const [december] = (await repository.findEffective(12, 2032)).filter((row) => row.categoryId === categoryId)
    expect(december).toMatchObject({ monthlyLimit: 800, month: 12, year: 2032 })
  })

  it('should answer 404 when deleting a limit that does not exist', async () => {
    await expect(repository.delete('missing')).rejects.toBeInstanceOf(CategoryBudgetNotFoundException)
  })

  it('should add the PEN spending per category of the month, save the card installments and the shared debts', async () => {
    const draft = (messageId: string) =>
      prisma.expenseDraft.create({
        data: { channel: 'web', chatId: 'budget', messageId: `${messageId}-${suffix}`, inputType: 'manual', personId },
      })
    const card = { description: 'Laptop', amount: 100, personId, categoryId, paymentMethodId }

    await expenses.saveFromExpenseDraft((await draft('card')).id, {
      destination: ExpenseDestination.CREDIT_CARD,
      data: { ...card, installment: '1/3', paymentMonth: 11, paymentYear: 2032 },
      nextInstallments: [
        { ...card, installment: '2/3', paymentMonth: 12, paymentYear: 2032 },
        { ...card, installment: '3/3', paymentMonth: 1, paymentYear: 2033 },
      ],
    })
    await expenses.saveFromExpenseDraft((await draft('dinner')).id, {
      destination: ExpenseDestination.DAILY,
      data: {
        description: 'Cena',
        amount: 60,
        personId,
        categoryId,
        paymentMethodId,
        spentAt: new Date('2032-11-20T00:00:00.000Z'),
      },
      sharedDebts: [
        {
          direction: 'owed_to_me',
          description: 'Cena (compartido)',
          amount: 60,
          personId,
          paymentMonth: 11,
          paymentYear: 2032,
        },
      ],
    })

    const november = await expenses.findSpentByCategory(11, 2032)
    expect(november.find((row) => row.categoryId === categoryId)?.total).toBe(160)
    const january = await expenses.findSpentByCategory(1, 2033)
    expect(january.find((row) => row.categoryId === categoryId)?.total).toBe(100)
    expect(await prisma.debt.findMany({ where: { personId }, select: { description: true, amount: true } })).toEqual([
      { description: 'Cena (compartido)', amount: 60 },
    ])
  })
})
