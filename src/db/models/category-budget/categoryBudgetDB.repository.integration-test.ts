import { ConfigService } from '@nestjs/config'

import { CategoryBudgetNotFoundException } from '@/commons/exceptions/budget/category-budget-not-found.exception'
import { SavedExpenseLockedException } from '@/commons/exceptions/expense/saved-expense-locked.exception'
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

  // D73 + D76: a shared card purchase keeps the total, counts your part and is replaced as a whole by an edit
  it('should count only your part of a shared expense and replace its rows when an edit is saved', async () => {
    const draft = (messageId: string) =>
      prisma.expenseDraft.create({
        data: { channel: 'web', chatId: 'budget', messageId: `${messageId}-${suffix}`, inputType: 'manual', personId },
      })
    const original = await draft('shared')
    const row = { description: 'Tv', amount: 200, othersShare: 100, personId, categoryId, paymentMethodId }
    const debt = {
      direction: 'owed_to_me',
      description: 'Tv (compartido)',
      amount: 100,
      personId,
      originDraftId: original.id,
    }

    await expenses.saveFromExpenseDraft(original.id, {
      destination: ExpenseDestination.CREDIT_CARD,
      data: { ...row, installment: '1/2', paymentMonth: 3, paymentYear: 2033 },
      nextInstallments: [
        { ...row, installment: '2/2', paymentMonth: 4, paymentYear: 2033, originDraftId: original.id },
      ],
      sharedDebts: [
        { ...debt, installment: '1/2', paymentMonth: 3, paymentYear: 2033 },
        { ...debt, installment: '2/2', paymentMonth: 4, paymentYear: 2033 },
      ],
    })
    const march = await expenses.findSpentByCategory(3, 2033, personId)
    expect(march.find((line) => line.categoryId === categoryId)?.total).toBe(100)

    // the edit keeps only one row, not shared
    const copy = await draft('shared-edit')
    await expenses.saveFromExpenseDraft(
      copy.id,
      {
        destination: ExpenseDestination.CREDIT_CARD,
        data: { ...row, othersShare: 0, amount: 180, paymentMonth: 3, paymentYear: 2033 },
        nextInstallments: [],
      },
      original.id,
    )

    const rows = await prisma.creditCardExpense.findMany({ where: { description: 'Tv' } })
    expect(rows.map((card) => [card.amount, card.draftId])).toEqual([[180, copy.id]])
    expect(await prisma.debt.count({ where: { description: 'Tv (compartido)' } })).toBe(0)
    expect((await prisma.expenseDraft.findUnique({ where: { id: original.id } }))?.status).toBe('discarded')
    expect((await prisma.expenseDraft.findUnique({ where: { id: copy.id } }))?.status).toBe('saved')
  })

  it('should not replace a saved expense whose debts have payments', async () => {
    const original = await prisma.expenseDraft.create({
      data: { channel: 'web', chatId: 'budget', messageId: `paid-${suffix}`, inputType: 'manual', personId },
    })
    await expenses.saveFromExpenseDraft(original.id, {
      destination: ExpenseDestination.DAILY,
      data: {
        description: 'Pizza',
        amount: 90,
        othersShare: 45,
        personId,
        paymentMethodId,
        spentAt: new Date('2033-05-01'),
      },
      sharedDebts: [
        {
          direction: 'owed_to_me',
          description: 'Pizza (compartido)',
          amount: 45,
          personId,
          originDraftId: original.id,
          paymentMonth: 5,
          paymentYear: 2033,
        },
      ],
    })
    const [paidDebt] = await prisma.debt.findMany({ where: { originDraftId: original.id } })
    await prisma.debtPayment.create({
      data: { debtId: paidDebt.id, amount: 45, paidAt: new Date('2033-05-02'), confirmedAt: new Date() },
    })
    const copy = await prisma.expenseDraft.create({
      data: { channel: 'web', chatId: 'budget', messageId: `paid-edit-${suffix}`, inputType: 'manual', personId },
    })

    await expect(
      expenses.saveFromExpenseDraft(
        copy.id,
        {
          destination: ExpenseDestination.DAILY,
          data: { description: 'Pizza', amount: 100, personId, paymentMethodId, spentAt: new Date('2033-05-01') },
        },
        original.id,
      ),
    ).rejects.toBeInstanceOf(SavedExpenseLockedException)
    expect(await prisma.dailyExpense.count({ where: { description: 'Pizza' } })).toBe(1)
  })
})
