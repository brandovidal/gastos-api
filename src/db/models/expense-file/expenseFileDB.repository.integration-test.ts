import { ConfigService } from '@nestjs/config'

import { PrismaService } from '@/db/prisma/prisma.service'
import { ExpenseFileChannel, ExpenseFileInputType, ExpenseFileStatus } from '@/commons/constants/expense-file.constant'
import { DuplicateExpenseFileException } from '@/commons/exceptions/expense-file/duplicate-expense-file.exception'

import { ExpenseFileDBRepository } from './expenseFileDB.repository'
import { ExpenseFileDBSerializer } from './expenseFileDB.serializer'

describe('ExpenseFileDBRepository (integration)', () => {
  let prisma: PrismaService
  let repository: ExpenseFileDBRepository

  const chatId = 'integration-chat'

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ db: { url: process.env.DATABASE_URL ?? 'file:./test.db' } }))
    await prisma.onModuleInit()
    repository = new ExpenseFileDBRepository(prisma, new ExpenseFileDBSerializer())
  })

  afterAll(async () => {
    await prisma.onModuleDestroy()
  })

  it('should reject the same channel message twice through the libSQL adapter', async () => {
    const data = {
      channel: ExpenseFileChannel.TELEGRAM,
      chatId,
      messageId: '1',
      inputType: ExpenseFileInputType.TEXT,
    }

    await repository.create(data)

    await expect(repository.create(data)).rejects.toThrow(DuplicateExpenseFileException)
    await expect(repository.create({ ...data, itemIndex: 1 })).resolves.toBeDefined()
  })

  it('should find the open expense file of a chat and link it to the expense it creates', async () => {
    const expenseFile = await repository.create({
      channel: ExpenseFileChannel.TELEGRAM,
      chatId,
      messageId: '2',
      inputType: ExpenseFileInputType.TEXT,
    })
    await repository.update(expenseFile.id, {
      status: ExpenseFileStatus.AWAITING_CONFIRMATION,
      confidence: { amount: 0.9 },
      missingFields: [],
    })

    const open = await repository.findOpenByChat(ExpenseFileChannel.TELEGRAM, chatId, new Date(Date.now() - 60_000))

    expect(open?.id).toBe(expenseFile.id)
    expect(open?.confidence).toEqual({ amount: 0.9 })

    const person = await prisma.person.create({ data: { name: 'Integration Person' } })
    await prisma.accountReceivable.create({
      data: { description: 'Loan', amount: 20, personId: person.id, expenseFileId: expenseFile.id },
    })

    const linked = await prisma.expenseFile.findUniqueOrThrow({
      where: { id: expenseFile.id },
      include: { accountReceivable: true },
    })
    expect(linked.accountReceivable?.amount).toBe(20)
  })

  it('should discard open expense files not updated since the given date', async () => {
    const count = await repository.discardOpenUpdatedBefore(
      ExpenseFileChannel.TELEGRAM,
      chatId,
      new Date(Date.now() + 60_000),
    )

    expect(count).toBeGreaterThan(0)
    await expect(
      repository.findOpenByChat(ExpenseFileChannel.TELEGRAM, chatId, new Date(Date.now() - 60_000)),
    ).resolves.toBeNull()
  })
})
