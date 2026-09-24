import { ConfigService } from '@nestjs/config'

import { NotificationKind } from '@/commons/constants/notification.constant'
import { NotificationNotFoundException } from '@/commons/exceptions/notification/notification-not-found.exception'
import { PrismaService } from '@/db/prisma/prisma.service'

import { NotificationDBRepository } from './notificationDB.repository'

// Notifications (P20) on SQLite: the same notice is never saved twice, and read / settings round-trip
describe('NotificationDBRepository (integration)', () => {
  let prisma: PrismaService
  let repository: NotificationDBRepository
  const suffix = Date.now()

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ db: { url: process.env.DATABASE_URL ?? 'file:./test.db' } }))
    await prisma.onModuleInit()
    repository = new NotificationDBRepository(prisma)
  })

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { dedupeKey: { contains: String(suffix) } } })
    await prisma.notificationSetting.deleteMany()
    await prisma.onModuleDestroy()
  })

  it('should return null for a notice with an existing dedupeKey', async () => {
    const data = { kind: NotificationKind.DUE, title: 'Luz', body: 'Vence mañana', dedupeKey: `due:${suffix}` }

    const first = await repository.createUnique(data)
    const second = await repository.createUnique({ ...data, title: 'Otra vez' })

    expect(first).toMatchObject({ title: 'Luz', readAt: null })
    expect(second).toBeNull()
  })

  it('should mark a notice read only once and answer 404 for an unknown one', async () => {
    const created = await repository.createUnique({
      kind: NotificationKind.WEEKLY,
      title: 'Tu semana',
      body: '…',
      dedupeKey: `weekly:${suffix}`,
    })

    expect(await repository.markRead(created!.id)).toBe(true)
    expect(await repository.markRead(created!.id)).toBe(false)
    await expect(repository.markRead('missing')).rejects.toBeInstanceOf(NotificationNotFoundException)
  })

  it('should keep one setting row per kind', async () => {
    await repository.upsertSetting(NotificationKind.DAILY_CLOSE, true, true)
    await repository.upsertSetting(NotificationKind.DAILY_CLOSE, false, true)

    expect(await repository.findSettings()).toEqual([
      expect.objectContaining({ kind: NotificationKind.DAILY_CLOSE, telegram: false, web: true }),
    ])
  })
})
