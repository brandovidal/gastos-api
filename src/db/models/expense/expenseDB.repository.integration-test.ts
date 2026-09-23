import { ConfigService } from '@nestjs/config'

import { PrismaService } from '@/db/prisma/prisma.service'
import { ExpenseDestination, PaymentStatus } from '@/commons/constants/expense.constant'
import { ExpenseFileChannel, ExpenseFileInputType, ExpenseFileStatus } from '@/commons/constants/expense-file.constant'

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

  it('should create the expense and close its ExpenseFile in one transaction, then total the month', async () => {
    const person = await prisma.person.create({ data: { name: 'Totals Person', isDefault: true } })
    const category = await prisma.category.create({ data: { name: 'Totals Category' } })
    const expenseFile = await prisma.expenseFile.create({
      data: {
        channel: ExpenseFileChannel.TELEGRAM,
        chatId: 'expense-db-chat',
        messageId: '1',
        inputType: ExpenseFileInputType.TEXT,
        status: ExpenseFileStatus.AWAITING_CONFIRMATION,
      },
    })

    const { id } = await repository.saveFromExpenseFile(expenseFile.id, {
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

    const saved = await prisma.expenseFile.findUniqueOrThrow({
      where: { id: expenseFile.id },
      include: { fixedCost: true },
    })
    expect(saved.status).toBe(ExpenseFileStatus.SAVED)
    expect(saved.confirmedAt).not.toBeNull()
    expect(saved.fixedCost?.id).toBe(id)

    await expect(repository.findMonthlyTotals(9, 2031)).resolves.toEqual([
      { destination: ExpenseDestination.FIXED_COST, currency: 'PEN', personId: person.id, total: 1000, count: 1 },
    ])
  })

  it('should roll back the expense when the ExpenseFile cannot be updated', async () => {
    const person = await prisma.person.create({ data: { name: 'Rollback Person' } })

    await expect(
      repository.saveFromExpenseFile('missing-expense-file', {
        destination: ExpenseDestination.RECEIVABLE,
        data: { description: 'Rollback loan', amount: 10, personId: person.id },
      }),
    ).rejects.toThrow()

    await expect(prisma.accountReceivable.count({ where: { description: 'Rollback loan' } })).resolves.toBe(0)
  })
})
