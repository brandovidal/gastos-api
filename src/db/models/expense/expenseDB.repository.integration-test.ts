import { ConfigService } from '@nestjs/config'

import { PrismaService } from '@/db/prisma/prisma.service'
import { ExpenseDestination, PaymentStatus } from '@/commons/constants/expense.constant'
import {
  ExpenseDraftChannel,
  ExpenseDraftInputType,
  ExpenseDraftStatus,
} from '@/commons/constants/expense-draft.constant'

import { ExpenseDBRepository } from './expenseDB.repository'

describe('ExpenseDBRepository (integration)', () => {
  let prisma: PrismaService
  let repository: ExpenseDBRepository

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ db: { url: process.env.DATABASE_URL ?? 'file:./test.db' } }))
    await prisma.onModuleInit()
    repository = new ExpenseDBRepository(prisma)
  })

  afterAll(async () => {
    await prisma.onModuleDestroy()
  })

  it('should create the expense and close its ExpenseDraft in one transaction, then total the month', async () => {
    const person = await prisma.person.create({ data: { name: 'Totals Person', isDefault: true } })
    const category = await prisma.category.create({ data: { name: 'Totals Category' } })
    const expenseDraft = await prisma.expenseDraft.create({
      data: {
        channel: ExpenseDraftChannel.TELEGRAM,
        chatId: 'expense-db-chat',
        messageId: '1',
        inputType: ExpenseDraftInputType.TEXT,
        status: ExpenseDraftStatus.AWAITING_CONFIRMATION,
      },
    })

    const { id } = await repository.saveFromExpenseDraft(expenseDraft.id, {
      destination: ExpenseDestination.FIXED_COST,
      data: {
        description: 'Alquiler',
        amount: 1000,
        personId: person.id,
        categoryId: category.id,
        paymentMonth: 9,
        paymentYear: 2031,
        paymentStatus: PaymentStatus.NOT_STARTED,
      },
    })

    const saved = await prisma.expenseDraft.findUniqueOrThrow({
      where: { id: expenseDraft.id },
      include: { fixedCost: true },
    })
    expect(saved.status).toBe(ExpenseDraftStatus.SAVED)
    expect(saved.confirmedAt).not.toBeNull()
    expect(saved.fixedCost?.id).toBe(id)

    // Receivables are not scoped by month: other tests' pending loans also show up, so look at this person only
    const totals = (await repository.findMonthlyTotals(9, 2031)).filter((row) => row.personId === person.id)
    expect(totals).toEqual([
      { destination: ExpenseDestination.FIXED_COST, currency: 'PEN', personId: person.id, total: 1000, count: 1 },
    ])
  })

  it('should roll back the expense when the ExpenseDraft cannot be updated', async () => {
    const person = await prisma.person.create({ data: { name: 'Rollback Person' } })

    await expect(
      repository.saveFromExpenseDraft('missing-expense-file', {
        destination: ExpenseDestination.RECEIVABLE,
        data: { description: 'Rollback loan', amount: 10, personId: person.id },
      }),
    ).rejects.toThrow()

    await expect(prisma.accountReceivable.count({ where: { description: 'Rollback loan' } })).resolves.toBe(0)
  })

  it('should save a day-to-day expense in exp_daily_expenses and count it in the month', async () => {
    const person = await prisma.person.create({ data: { name: 'Daily Person' } })
    const method = await prisma.paymentMethod.create({ data: { name: 'Daily Wallet', type: 'wallet' } })
    const draft = await prisma.expenseDraft.create({
      data: {
        channel: ExpenseDraftChannel.TELEGRAM,
        chatId: 'expense-db-chat',
        messageId: 'daily-1',
        inputType: ExpenseDraftInputType.TEXT,
        status: ExpenseDraftStatus.AWAITING_CONFIRMATION,
        destination: ExpenseDestination.DAILY,
      },
    })

    const { id } = await repository.saveFromExpenseDraft(draft.id, {
      destination: ExpenseDestination.DAILY,
      data: {
        description: 'Almuerzo',
        amount: 25,
        spentAt: new Date('2032-03-15T00:00:00.000Z'),
        personId: person.id,
        paymentMethodId: method.id,
      },
    })

    const saved = await prisma.expenseDraft.findUniqueOrThrow({
      where: { id: draft.id },
      include: { dailyExpense: true },
    })
    expect(saved.status).toBe(ExpenseDraftStatus.SAVED)
    expect(saved.dailyExpense?.id).toBe(id)

    const ofPerson = async (month: number) =>
      (await repository.findMonthlyTotals(month, 2032)).filter((row) => row.personId === person.id)

    await expect(ofPerson(3)).resolves.toEqual([
      { destination: ExpenseDestination.DAILY, currency: 'PEN', personId: person.id, total: 25, count: 1 },
    ])
    await expect(ofPerson(4)).resolves.toEqual([])
  })
})
