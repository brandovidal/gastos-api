import { ConfigService } from '@nestjs/config'

import { PrismaService } from '@/db/prisma/prisma.service'
import {
  ExpenseDraftChannel,
  ExpenseDraftInputType,
  ExpenseDraftStatus,
} from '@/commons/constants/expense-draft.constant'
import { DuplicateExpenseDraftException } from '@/commons/exceptions/expense-draft/duplicate-expense-draft.exception'

import { ExpenseDraftDBRepository } from './expenseDraftDB.repository'
import { ExpenseDraftDBSerializer } from './expenseDraftDB.serializer'

describe('ExpenseDraftDBRepository (integration)', () => {
  let prisma: PrismaService
  let repository: ExpenseDraftDBRepository

  const chatId = 'integration-chat'

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ db: { url: process.env.DATABASE_URL ?? 'file:./test.db' } }))
    await prisma.onModuleInit()
    repository = new ExpenseDraftDBRepository(prisma, new ExpenseDraftDBSerializer())
  })

  afterAll(async () => {
    await prisma.onModuleDestroy()
  })

  it('should reject the same channel message twice through the libSQL adapter', async () => {
    const data = {
      channel: ExpenseDraftChannel.TELEGRAM,
      chatId,
      messageId: '1',
      inputType: ExpenseDraftInputType.TEXT,
    }

    await repository.create(data)

    await expect(repository.create(data)).rejects.toThrow(DuplicateExpenseDraftException)
    await expect(repository.create({ ...data, itemIndex: 1 })).resolves.toBeDefined()
  })

  it('should find the open expense draft of a chat and link it to the expense it creates', async () => {
    const expenseDraft = await repository.create({
      channel: ExpenseDraftChannel.TELEGRAM,
      chatId,
      messageId: '2',
      inputType: ExpenseDraftInputType.TEXT,
    })
    await repository.update(expenseDraft.id, {
      status: ExpenseDraftStatus.AWAITING_CONFIRMATION,
      confidence: { amount: 0.9 },
      missingFields: [],
    })

    const open = await repository.findOpenByChat(ExpenseDraftChannel.TELEGRAM, chatId, new Date(Date.now() - 60_000))

    expect(open?.id).toBe(expenseDraft.id)
    expect(open?.confidence).toEqual({ amount: 0.9 })

    const person = await prisma.person.create({ data: { name: 'Integration Person' } })
    await prisma.accountReceivable.create({
      data: { description: 'Loan', amount: 20, personId: person.id, draftId: expenseDraft.id },
    })

    const linked = await prisma.expenseDraft.findUniqueOrThrow({
      where: { id: expenseDraft.id },
      include: { accountReceivable: true },
    })
    expect(linked.accountReceivable?.amount).toBe(20)
  })

  it('should move open expense drafts not updated since the given date to Borrador', async () => {
    const count = await repository.moveStaleOpenToReview(
      ExpenseDraftChannel.TELEGRAM,
      chatId,
      new Date(Date.now() + 60_000),
    )

    expect(count).toBeGreaterThan(0)
    await expect(
      repository.findOpenByChat(ExpenseDraftChannel.TELEGRAM, chatId, new Date(Date.now() - 60_000)),
    ).resolves.toBeNull()
  })

  it('should fail only the drafts whose extraction never finished, grouped by chat', async () => {
    const interruptedChat = 'integration-interrupted'
    const base = {
      channel: ExpenseDraftChannel.TELEGRAM,
      chatId: interruptedChat,
      inputType: ExpenseDraftInputType.TEXT,
    }
    const interrupted = await repository.create({ ...base, messageId: '1', rawText: 'almuerzo 25' })
    const extracted = await repository.create({ ...base, messageId: '2', rawText: 'taxi 10' })
    await repository.update(extracted.id, { description: 'taxi', amount: 10, pendingField: 'paymentMethodId' })

    const affected = await repository.failInterruptedUpdatedBefore(
      ExpenseDraftChannel.TELEGRAM,
      new Date(Date.now() + 60_000),
      interruptedChat,
    )

    expect(affected).toEqual([{ chatId: interruptedChat, count: 1 }])
    await expect(repository.findById(interrupted.id)).resolves.toMatchObject({ status: ExpenseDraftStatus.FAILED })
    await expect(repository.findById(extracted.id)).resolves.toMatchObject({ status: ExpenseDraftStatus.DRAFT })
  })
})
