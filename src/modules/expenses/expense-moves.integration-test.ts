import { ConfigService } from '@nestjs/config'

import { PrismaService } from '@/db/prisma/prisma.service'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import {
  ExpenseDraftChannel,
  ExpenseDraftInputType,
  ExpenseDraftStatus,
} from '@/commons/constants/expense-draft.constant'
import {
  PaymentStatus,
  RecurringTargetType,
  SubscriptionKind,
  SubscriptionPeriod,
} from '@/commons/constants/expense.constant'
import { ExpenseMoveBlockedException } from '@/commons/exceptions/expense/expense-move-blocked.exception'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { ExpenseRecordDBRepository, ExpenseResource } from '@/db/models/expense-record/expenseRecordDB.repository'

import { ExpenseMovesService } from './expense-moves.service'

// P26 against SQLite: "Pasar a…" moves the whole series (D106) and the budget counts Recurrentes (D107).
// Catalogs are created inactive: recorded AI answers pick catalog entries by position (conversation integration test)
const PEOPLE = ['Move Me', 'Move Papa', 'Move Blocked', 'Budget Switch']
const CATEGORIES = ['Move Personal', 'Budget Switch Home']

describe('Pasar a… and the budget switches (integration)', () => {
  let prisma: PrismaService
  let service: ExpenseMovesService
  let expenses: ExpenseDBRepository

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ db: { url: process.env.DATABASE_URL ?? 'file:./test.db' } }))
    await prisma.onModuleInit()
    service = new ExpenseMovesService(new ExpenseRecordDBRepository(prisma))
    expenses = new ExpenseDBRepository(prisma)
  })

  // Leaves test.db as it found it: its categories would shift the catalog refs of the recorded AI answers
  afterAll(async () => {
    const people = { person: { name: { in: PEOPLE } } }
    await prisma.subscription.deleteMany({ where: people })
    await prisma.fixedCost.deleteMany({ where: people })
    await prisma.recurringExpense.deleteMany({ where: people })
    await prisma.expenseDraft.deleteMany({ where: { chatId: 'expense-moves-chat' } })
    await prisma.category.deleteMany({ where: { name: { in: CATEGORIES } } })
    await prisma.paymentMethod.deleteMany({ where: { name: 'Switch Card' } })
    await prisma.person.deleteMany({ where: { name: { in: PEOPLE } } })
    await prisma.onModuleDestroy()
  })

  const draft = (messageId: string, status = ExpenseDraftStatus.SAVED, replacesDraftId?: string) =>
    prisma.expenseDraft.create({
      data: {
        channel: ExpenseDraftChannel.TELEGRAM,
        chatId: 'expense-moves-chat',
        messageId,
        inputType: ExpenseDraftInputType.TEXT,
        status,
        replacesDraftId,
      },
    })

  it('should move every month of a fixed cost and its template to Recurrentes, keeping ids and links', async () => {
    const me = await prisma.person.create({ data: { name: 'Move Me', isActive: false } })
    const papa = await prisma.person.create({ data: { name: 'Move Papa', isActive: false } })
    const category = await prisma.category.create({ data: { name: 'Move Personal' } })
    const saved = await draft('move-1')
    const month = (paymentMonth: number, personId = me.id, draftId?: string) =>
      prisma.fixedCost.create({
        data: {
          description: 'Bitel Move',
          amount: 29.9,
          othersShare: 5,
          personId,
          categoryId: category.id,
          paymentMonth,
          paymentYear: 2030,
          paymentStatus: PaymentStatus.DEPOSITED,
          attentionDate: new Date(Date.UTC(2030, paymentMonth - 1, 3)),
          importKey: `notion:move#${personId}-${paymentMonth}`,
          draftId,
        },
      })
    const rows = [await month(3, me.id, saved.id), await month(1), await month(2)]
    const otherPerson = await month(1, papa.id)
    await prisma.recurringExpense.create({
      data: {
        description: 'Bitel Move',
        amount: 29.9,
        targetType: RecurringTargetType.FIXED_COST,
        personId: me.id,
        categoryId: category.id,
        dayOfMonth: 3,
      },
    })

    const preview = await service.move({
      resource: ExpenseResource.FIXED_COST,
      id: rows[0].id,
      to: ExpenseResource.SUBSCRIPTION,
      kind: SubscriptionKind.SERVICE,
      dryRun: true,
    })
    expect(preview).toEqual(
      expect.objectContaining({
        count: 3,
        from: { month: 1, year: 2030 },
        until: { month: 3, year: 2030 },
        templates: 1,
        blocked: [],
      }),
    )
    expect(await prisma.fixedCost.count({ where: { description: 'Bitel Move' } })).toBe(4)

    await service.move({
      resource: ExpenseResource.FIXED_COST,
      id: rows[0].id,
      to: ExpenseResource.SUBSCRIPTION,
      kind: SubscriptionKind.SERVICE,
    })

    const moved = await prisma.subscription.findMany({
      where: { description: 'Bitel Move' },
      orderBy: { paymentMonth: 'asc' },
    })
    expect(moved.map((row) => row.id).sort()).toEqual(rows.map((row) => row.id).sort())
    expect(moved[2]).toEqual(
      expect.objectContaining({
        draftId: saved.id,
        othersShare: 5,
        kind: SubscriptionKind.SERVICE,
        period: SubscriptionPeriod.MONTHLY,
        paymentStatus: PaymentStatus.PAID,
        dueDate: new Date(Date.UTC(2030, 2, 3)),
        importKey: `notion:move#${me.id}-3`,
      }),
    )
    // Papa's Bitel is another series; the template now generates Recurrentes
    expect(await prisma.fixedCost.findUnique({ where: { id: otherPerson.id } })).not.toBeNull()
    expect(await prisma.recurringExpense.findFirstOrThrow({ where: { description: 'Bitel Move' } })).toEqual(
      expect.objectContaining({ targetType: RecurringTargetType.SUBSCRIPTION, kind: SubscriptionKind.SERVICE }),
    )
  })

  it('should not move a series while one of its rows has an /editar copy open, nor fixed costs without category', async () => {
    const me = await prisma.person.create({ data: { name: 'Move Blocked', isActive: false } })
    const saved = await draft('move-blocked')
    await draft('move-blocked-edit', ExpenseDraftStatus.EDITING, saved.id)
    const netflix = await prisma.subscription.create({
      data: {
        description: 'Netflix Move',
        amount: 52.8,
        period: SubscriptionPeriod.MONTHLY,
        personId: me.id,
        paymentMonth: 9,
        paymentYear: 2030,
        draftId: saved.id,
      },
    })
    const toFixedCosts = { resource: ExpenseResource.SUBSCRIPTION, id: netflix.id, to: ExpenseResource.FIXED_COST }

    expect((await service.move({ ...toFixedCosts, dryRun: true })).withoutCategory).toBe(1)
    await expect(service.move(toFixedCosts)).rejects.toBeInstanceOf(ExpenseMoveBlockedException)
    expect(await prisma.subscription.findUnique({ where: { id: netflix.id } })).not.toBeNull()
  })

  it('should count Recurrentes not paid with a credit card and leave Plataformas out (D96, D107)', async () => {
    const me = await prisma.person.create({ data: { name: 'Budget Switch', isActive: false } })
    const category = await prisma.category.create({ data: { name: 'Budget Switch Home' } })
    const card = await prisma.paymentMethod.create({
      data: { name: 'Switch Card', type: PaymentMethodType.CREDIT_CARD, isActive: false, showInBot: false },
    })
    const subscription = (description: string, kind: string, amount: number, paymentMethodId?: string) =>
      prisma.subscription.create({
        data: {
          description,
          amount,
          kind,
          period: SubscriptionPeriod.MONTHLY,
          personId: me.id,
          categoryId: category.id,
          paymentMethodId,
          paymentMonth: 9,
          paymentYear: 2030,
        },
      })
    await subscription('Enel', SubscriptionKind.SERVICE, 150)
    await subscription('Internet by card', SubscriptionKind.SERVICE, 90, card.id)
    await subscription('Codely', SubscriptionKind.PLATFORM, 900)

    const spent = (kinds: string[]) =>
      expenses
        .findSpentByCategory(9, 2030, me.id, kinds)
        .then((rows) => rows.find((row) => row.categoryId === category.id)?.total)

    expect(await spent(['service', 'annual', 'other'])).toBe(150)
    expect(await spent(['platform', 'service', 'annual', 'other'])).toBe(1050)
    expect(await spent([])).toBeUndefined()
  })
})
