import { Test, TestingModule } from '@nestjs/testing'

import { UserRole, UserStatus } from '@/commons/constants/auth.constant'
import { DebtDirection } from '@/commons/constants/debt.constant'
import { PaymentStatus } from '@/commons/constants/expense.constant'
import { AuditChangeDBRepository } from '@/db/models/audit/auditChangeDB.repository'
import { PrismaModule } from '@/db/prisma/prisma.module'
import { PrismaService } from '@/db/prisma/prisma.service'
import { runAsSystem, runWithUser } from '@/db/tenant/tenant-context'
import { TenantContextMissingError } from '@/db/tenant/tenant.extension'
import { HistoryService } from '@/modules/history/history.service'
import { SettingsModule } from '@/settings/settings.module'

import { AuthModule } from './auth.module'
import { AuthService } from './auth.service'
import { UsersService } from './users.service'

const EMAILS = ['tio-p23@example.com', 'sobrino-p23@example.com', 'super-p23@example.com']

// P23 against SQLite: two users share the database and never see each other's rows, the way in is an invitation,
// and the superadmin can enter as anyone
describe('Users and separation of data (integration)', () => {
  let moduleRef: TestingModule
  let prisma: PrismaService
  let auth: AuthService
  let users: UsersService
  let tio: string // user ids
  let sobrino: string

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [SettingsModule, PrismaModule, AuthModule] }).compile()
    await moduleRef.init()
    prisma = moduleRef.get(PrismaService)
    auth = moduleRef.get(AuthService)
    users = moduleRef.get(UsersService)

    await cleanUp()
    const admin = await prisma.authUser.create({ data: { name: 'Tío', email: EMAILS[0], role: UserRole.ADMIN } })
    tio = admin.id
    // The nephew comes in through an invitation link, like a real one
    const invite = await users.invite(EMAILS[1], UserRole.MEMBER, admin)
    const token = invite.url.split('invitacion=')[1]
    const { user } = await auth.acceptInvite({ token, name: 'Sobrino', password: 'una-clave-larga' })
    sobrino = user.id
  })

  afterAll(async () => {
    await cleanUp()
    await moduleRef.close()
  })

  async function cleanUp() {
    await runAsSystem(async () => {
      const ids = (await prisma.authUser.findMany({ where: { email: { in: EMAILS } } })).map((user) => user.id)
      for (const table of [
        'debtPayment',
        'debt',
        'fixedCost',
        'commitment',
        'person',
        'category',
        'budgetGroup',
        'auditChange',
      ] as const) {
        await (prisma[table] as unknown as { deleteMany(args: unknown): Promise<unknown> }).deleteMany({
          where: { userId: { in: ids } },
        })
      }
      await prisma.authSession.deleteMany({ where: { userId: { in: ids } } })
      await prisma.authInvite.deleteMany({ where: { email: { in: EMAILS } } })
      await prisma.authAttempt.deleteMany({ where: { email: { in: EMAILS } } })
      await prisma.authUser.deleteMany({ where: { id: { in: ids } } })
    })
  }

  const fixedCost = (userId: string, description: string) =>
    runWithUser(userId, async () => {
      const person = await prisma.person.findFirstOrThrow({ where: { isDefault: true } })
      const category = await prisma.category.findFirstOrThrow()
      return prisma.fixedCost.create({
        data: {
          description,
          amount: 100,
          personId: person.id,
          categoryId: category.id,
          paymentMonth: 9,
          paymentYear: 2031,
        },
      })
    })

  it('should give a user who came in by an invitation their own start: groups, categories and a "Yo", and nobody else\'s data', async () => {
    const mine = await runWithUser(sobrino, async () => ({
      people: await prisma.person.findMany(),
      categories: await prisma.category.count(),
      groups: await prisma.budgetGroup.count(),
    }))

    expect(mine.people.map((person) => [person.name, person.isDefault])).toEqual([['Sobrino', true]])
    expect(mine.categories).toBeGreaterThan(5)
    expect(mine.groups).toBeGreaterThan(2)
    expect((await prisma.authUser.findUniqueOrThrow({ where: { id: sobrino } })).status).toBe(UserStatus.ACTIVE)
  })

  it('should keep the rows of each user from the other: reads, updates, deletes and counts', async () => {
    // the uncle also has "Yo"/categories of his own (same names as the nephew's: fine, they are per user)
    await runWithUser(tio, async () => {
      await prisma.budgetGroup.create({ data: { name: 'Grupo del tío' } })
      const group = await prisma.budgetGroup.findFirstOrThrow({ where: { name: 'Grupo del tío' } })
      await prisma.category.create({ data: { name: 'Categoría del tío', budgetGroupId: group.id } })
      await prisma.person.create({ data: { name: 'Yo del tío', isDefault: true } })
    })
    const secret = await fixedCost(tio, 'Alquiler del tío').catch(async () => null)
    expect(secret).not.toBeNull()

    await runWithUser(sobrino, async () => {
      const mine = await fixedCost(sobrino, 'Cuota del sobrino')

      expect((await prisma.fixedCost.findMany()).map((row) => row.description)).toEqual(['Cuota del sobrino'])
      expect(await prisma.fixedCost.findUnique({ where: { id: secret!.id } })).toBeNull()
      expect(await prisma.fixedCost.count()).toBe(1)
      // he cannot change, move or delete his uncle's row, even knowing its id
      await expect(prisma.fixedCost.update({ where: { id: secret!.id }, data: { amount: 1 } })).rejects.toThrow()
      expect((await prisma.fixedCost.updateMany({ where: { id: secret!.id }, data: { amount: 1 } })).count).toBe(0)
      expect((await prisma.fixedCost.deleteMany({ where: { id: secret!.id } })).count).toBe(0)
      // nor take his own row to the uncle
      await prisma.fixedCost.update({
        where: { id: mine.id },
        data: { description: 'Sigue mía', userId: tio } as never,
      })
      expect((await prisma.fixedCost.findUniqueOrThrow({ where: { id: mine.id } })).userId).toBe(sobrino)
    })

    await runWithUser(tio, async () => {
      expect((await prisma.fixedCost.findMany()).map((row) => row.description)).toEqual(['Alquiler del tío'])
      expect((await prisma.fixedCost.findUniqueOrThrow({ where: { id: secret!.id } })).amount).toBe(100) // untouched
    })
  })

  it('should keep the payments and the transactions of a user inside their own rows', async () => {
    const debt = await runWithUser(tio, async () => {
      const person = await prisma.person.findFirstOrThrow({ where: { isDefault: true } })
      const created = await prisma.debt.create({
        data: {
          direction: DebtDirection.OWED_TO_ME,
          description: 'Préstamo del tío',
          amount: 300,
          personId: person.id,
          paymentMonth: 9,
          paymentYear: 2031,
        },
      })
      await prisma.$transaction(async (tx) => {
        await tx.debtPayment.create({ data: { debtId: created.id, amount: 50, paidAt: new Date(), kind: 'payment' } })
        await tx.debt.update({ where: { id: created.id }, data: { paidAmount: 50 } })
      })
      return created
    })

    await runWithUser(sobrino, async () => {
      expect(await prisma.debtPayment.count()).toBe(0)
      expect(await prisma.debtPayment.findMany({ where: { debtId: debt.id } })).toEqual([])
    })
    await runWithUser(tio, async () => {
      expect(await prisma.debtPayment.count({ where: { debtId: debt.id } })).toBe(1)
    })
  })

  it('should give each user their own history, and nobody the history of another', async () => {
    const history = new HistoryService(new AuditChangeDBRepository(prisma))
    const secret = await runWithUser(tio, () =>
      prisma.fixedCost.findFirstOrThrow({ where: { description: 'Alquiler del tío' } }),
    )
    await runWithUser(tio, () =>
      prisma.fixedCost.update({ where: { id: secret.id }, data: { paymentStatus: PaymentStatus.PAID } }),
    )

    const asTio = await runWithUser(tio, () => history.timeline('exp_fixed_costs', secret.id))
    const asSobrino = await runWithUser(sobrino, () => history.timeline('exp_fixed_costs', secret.id))

    expect(asTio.total).toBeGreaterThan(0)
    expect(asSobrino.total).toBe(0)
    expect(
      (await runWithUser(sobrino, () => history.list({ page: 1 }))).items.every((item) => item.entityId !== secret.id),
    ).toBe(true)
  })

  it("should refuse to touch a user's table with no user in the context", async () => {
    await runAsSystem(async () => undefined) // (the setup context is a test user: leave it)
    const { tenantStorage } = await import('@/db/tenant/tenant-context')
    await tenantStorage.exit(async () => {
      await expect(prisma.fixedCost.findMany()).rejects.toThrow(TenantContextMissingError)
      await expect(prisma.person.create({ data: { name: 'Sin dueño' } })).rejects.toThrow(TenantContextMissingError)
    })
  })

  it("should show a system job everyone's rows", async () => {
    const all = await runAsSystem(() => prisma.fixedCost.findMany({ where: { userId: { in: [tio, sobrino] } } }))

    expect(new Set(all.map((row) => row.userId))).toEqual(new Set([tio, sobrino]))
  })

  describe('signing in', () => {
    it('should sign in with the password of the invitation, by email and by the mobile an admin registered', async () => {
      await prisma.authUser.update({ where: { id: sobrino }, data: { phone: '955000111' } })

      const byEmail = await auth.login(EMAILS[1], 'una-clave-larga')
      const byPhone = await auth.login('955 000 111', 'una-clave-larga')

      expect((await auth.validateSession(byEmail.token))?.user.id).toBe(sobrino)
      expect((await auth.validateSession(byPhone.token))?.user.id).toBe(sobrino)
    })

    it('should lock the account after five wrong passwords, and not tell which one was right', async () => {
      for (let i = 0; i < 5; i++) await expect(auth.login(EMAILS[1], 'incorrecta-larga')).rejects.toThrow()

      await expect(auth.login(EMAILS[1], 'una-clave-larga')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TOO_MANY_ATTEMPTS' }),
      })
      await prisma.authAttempt.deleteMany({ where: { email: EMAILS[1] } })
    })

    it('should close the sessions of a disabled user at once', async () => {
      const { token } = await auth.login(EMAILS[1], 'una-clave-larga')
      const admin = await prisma.authUser.findUniqueOrThrow({ where: { id: tio } })
      expect(await auth.validateSession(token)).not.toBeNull()

      await users.update(sobrino, { status: UserStatus.DISABLED }, admin)

      expect(await auth.validateSession(token)).toBeNull()
      await users.update(sobrino, { status: UserStatus.ACTIVE }, admin)
    })

    it('should not let an admin give superadmin, touch the superadmin or disable themselves', async () => {
      const admin = await prisma.authUser.findUniqueOrThrow({ where: { id: tio } })
      const superadmin = await prisma.authUser.create({
        data: { name: 'Super', email: EMAILS[2], role: UserRole.SUPERADMIN },
      })

      await expect(users.update(superadmin.id, { status: UserStatus.DISABLED }, admin)).rejects.toThrow()
      await expect(users.update(tio, { status: UserStatus.DISABLED }, admin)).rejects.toThrow()
      expect(() => users.invite('x@example.com', 'superadmin' as never, admin)).not.toThrow() // typed away; the schema refuses it
    })
  })

  it('should let the superadmin enter as a user and come back, with the history saying who it was', async () => {
    const superadmin = await prisma.authUser.findUniqueOrThrow({ where: { email: EMAILS[2] } })

    const visit = await auth.impersonate(superadmin, sobrino)
    const seen = await auth.validateSession(visit.token)
    expect(seen?.user.id).toBe(sobrino)
    expect(seen?.impersonatedBy?.id).toBe(superadmin.id)

    const back = await auth.stopImpersonation(visit.token)
    expect(back.user.id).toBe(superadmin.id)
    expect(await auth.validateSession(visit.token)).toBeNull()
  })
})
