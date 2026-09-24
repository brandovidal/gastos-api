import { ConfigService } from '@nestjs/config'

import { PaymentStatus, RecurringTargetType } from '@/commons/constants/expense.constant'
import { CalendarDBRepository } from '@/db/models/calendar/calendarDB.repository'
import { PrismaService } from '@/db/prisma/prisma.service'

import { RecurringExpenseDBRepository } from './recurringExpenseDB.repository'

// Recurrentes and ✅ Pagado (P20) on SQLite: a month is generated once, and paying a statement pays its unpaid rows
describe('RecurringExpenseDBRepository (integration)', () => {
  let prisma: PrismaService
  let repository: RecurringExpenseDBRepository
  let calendar: CalendarDBRepository
  let personId: string
  let categoryId: string
  let cardId: string
  const suffix = Date.now()

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ db: { url: process.env.DATABASE_URL ?? 'file:./test.db' } }))
    await prisma.onModuleInit()
    repository = new RecurringExpenseDBRepository(prisma)
    calendar = new CalendarDBRepository(prisma)
    personId = (await prisma.person.create({ data: { name: `Recurring Person ${suffix}` } })).id
    categoryId = (await prisma.category.create({ data: { name: `Recurring Category ${suffix}` } })).id
    cardId = (
      await prisma.paymentMethod.create({
        data: { name: `Recurring Card ${suffix}`, type: 'credit_card', isActive: false },
      })
    ).id
  })

  afterAll(async () => {
    // Out of the catalog again: conversation flows replay AI answers that point to catalog refs by position
    await prisma.fixedCost.deleteMany({ where: { personId } })
    await prisma.creditCardExpense.deleteMany({ where: { personId } })
    await prisma.recurringExpense.deleteMany({ where: { personId } })
    await prisma.paymentMethod.delete({ where: { id: cardId } })
    await prisma.category.delete({ where: { id: categoryId } })
    await prisma.person.delete({ where: { id: personId } })
    await prisma.onModuleDestroy()
  })

  it('should create the row of a month once, even if the job runs again', async () => {
    const recurring = await prisma.recurringExpense.create({
      data: {
        description: 'Alquiler',
        amount: 1200,
        targetType: RecurringTargetType.FIXED_COST,
        personId,
        categoryId,
        dayOfMonth: 5,
      },
    })
    const monthStart = new Date('2031-10-01T00:00:00.000Z')
    const row = {
      targetType: RecurringTargetType.FIXED_COST,
      data: {
        description: 'Alquiler',
        amount: 1200,
        personId,
        categoryId,
        paymentMonth: 10,
        paymentYear: 2031,
        paymentStatus: PaymentStatus.NOT_STARTED,
      },
    }

    const first = await repository.generate(recurring.id, monthStart, row)
    const again = await repository.generate(recurring.id, monthStart, row)
    const earlier = await repository.generate(recurring.id, new Date('2031-09-01T00:00:00.000Z'), row)

    expect(first).toEqual(expect.any(String))
    expect(again).toBeNull()
    expect(earlier).toBeNull()
    expect(await prisma.fixedCost.count({ where: { personId } })).toBe(1)
    expect((await prisma.recurringExpense.findUnique({ where: { id: recurring.id } }))?.lastGeneratedAt).toEqual(
      monthStart,
    )
  })

  it('should pay only the unpaid rows of that card statement', async () => {
    const row = (paymentStatus: string, paymentMonth = 10) => ({
      description: 'Compra',
      amount: 10,
      personId,
      paymentMethodId: cardId,
      paymentMonth,
      paymentYear: 2031,
      paymentStatus,
    })
    await prisma.creditCardExpense.createMany({
      data: [
        row(PaymentStatus.PENDING),
        row(PaymentStatus.NOT_STARTED),
        row(PaymentStatus.CASHBACK),
        row(PaymentStatus.PENDING, 11),
      ],
    })

    expect(await calendar.payCardStatement(cardId, { paymentMonth: 10, paymentYear: 2031 })).toBe(2)
    const statuses = await prisma.creditCardExpense.findMany({
      where: { personId },
      select: { paymentStatus: true, paymentMonth: true },
      orderBy: { paymentMonth: 'asc' },
    })
    expect(
      statuses
        .filter((item) => item.paymentMonth === 10)
        .map((item) => item.paymentStatus)
        .sort(),
    ).toEqual([PaymentStatus.CASHBACK, PaymentStatus.PAID, PaymentStatus.PAID])
    expect(statuses.find((item) => item.paymentMonth === 11)?.paymentStatus).toBe(PaymentStatus.PENDING)
  })
})
