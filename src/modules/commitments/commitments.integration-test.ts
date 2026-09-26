import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Test, TestingModule } from '@nestjs/testing'

import {
  AttachmentKind,
  AttachmentRefType,
  CommitmentKind,
  CommitmentSubtype,
} from '@/commons/constants/commitment.constant'
import { PaymentStatus } from '@/commons/constants/expense.constant'
import { StoredFileStatus } from '@/commons/constants/stored-file.constant'
import { ExpenseRecordDBModule } from '@/db/models/expense-record/expenseRecordDB.module'
import { PrismaModule } from '@/db/prisma/prisma.module'
import { PrismaService } from '@/db/prisma/prisma.service'
import { AttachmentsModule } from '@/modules/attachments/attachments.module'
import { AttachmentsService } from '@/modules/attachments/attachments.service'
import { SettingsModule } from '@/settings/settings.module'

import { CommitmentsModule } from './commitments.module'
import { CommitmentsService } from './commitments.service'
import { CommitmentsImporter } from './notion/commitments-importer'

const PERSON = 'P27 Test Person'
const CATEGORY = 'P27 Test Category'
const onDisk = (key: string) => join(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? '.data/storage', key)

// P27 against SQLite and the local folder: plan, installments as fixed costs, contributions, files and the Notion
// import. The catalogs are created and removed at the end
describe('Commitments (integration)', () => {
  let moduleRef: TestingModule
  let prisma: PrismaService
  let commitments: CommitmentsService
  let attachments: AttachmentsService
  let personId: string
  let categoryId: string
  let tmp: string
  const fileIds: string[] = []

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [SettingsModule, PrismaModule, CommitmentsModule, AttachmentsModule, ExpenseRecordDBModule],
    }).compile()
    await moduleRef.init()
    prisma = moduleRef.get(PrismaService)
    commitments = moduleRef.get(CommitmentsService)
    attachments = moduleRef.get(AttachmentsService)

    personId = (await prisma.person.create({ data: { name: PERSON, isActive: false } })).id
    categoryId = (await prisma.category.create({ data: { name: CATEGORY } })).id
    tmp = await mkdtemp(join(tmpdir(), 'p27-'))
  })

  afterAll(async () => {
    const owned = { OR: [{ personId }, { commitment: { personId } }] }
    await prisma.attachment.deleteMany({ where: { fileId: { in: fileIds } } })
    await prisma.storedFile.deleteMany({ where: { id: { in: fileIds } } })
    await prisma.fixedCost.deleteMany({ where: owned })
    await prisma.commitment.deleteMany({ where: { personId } })
    await prisma.category.delete({ where: { id: categoryId } })
    await prisma.person.delete({ where: { id: personId } })
    await rm(tmp, { recursive: true, force: true })
    await moduleRef.close()
  })

  const create = (overrides: Record<string, unknown> = {}) =>
    commitments.create({
      name: 'P27 Préstamo',
      kind: CommitmentKind.LOAN,
      subtype: CommitmentSubtype.LOAN,
      installmentCount: 4,
      installmentAmount: 500,
      dueDay: 31,
      startMonth: 11,
      startYear: 2031,
      personId,
      categoryId,
      ...overrides,
    })

  it('should create the installments as fixed costs and follow the progress as they are paid', async () => {
    const created = await create()

    expect(created.installments.map((row) => [row.installment, row.paymentMonth, row.paymentYear])).toEqual([
      ['1/4', 11, 2031],
      ['2/4', 12, 2031],
      ['3/4', 1, 2032],
      ['4/4', 2, 2032],
    ])
    expect(created.installments[3].dueDate?.toISOString().slice(0, 10)).toBe('2032-02-29') // a leap year
    expect(created.progress).toEqual(
      expect.objectContaining({ paidCount: 0, currentInstallment: 0, pendingAmount: 2000 }),
    )
    expect(created.totalAmount).toBe(2000)

    // The installments are plain fixed costs: they count in the month like any other
    const inMonth = await prisma.fixedCost.findMany({ where: { commitmentId: created.id, paymentMonth: 11 } })
    expect(inMonth).toEqual([expect.objectContaining({ amountInPen: 500, paymentStatus: PaymentStatus.NOT_STARTED })])

    await prisma.fixedCost.updateMany({
      where: { commitmentId: created.id, installment: { in: ['1/4', '2/4', '3/4', '4/4'] } },
      data: { paymentStatus: PaymentStatus.PAID },
    })
    const paid = await commitments.get(created.id)
    expect(paid.status).toBe('paid')
    expect(paid.progress).toEqual(expect.objectContaining({ paidCount: 4, remainingCount: 0, pendingAmount: 0 }))
  })

  it('should create only the missing installments and leave them as fixed costs when the commitment is deleted', async () => {
    const created = await create({ name: 'P27 Préstamo 2' })
    await prisma.fixedCost.delete({ where: { id: created.installments[1].id } })

    expect(await commitments.createMissingInstallments(created.id)).toEqual({ created: 1 })
    expect(await commitments.createMissingInstallments(created.id)).toEqual({ created: 0 })

    await commitments.delete(created.id)
    expect(await prisma.commitment.count({ where: { id: created.id } })).toBe(0)
    expect(
      await prisma.fixedCost.count({ where: { personId, description: 'P27 Préstamo 2', commitmentId: null } }),
    ).toBe(4)
  })

  it('should add up the contributions of an investment without installments', async () => {
    const bitcoin = await commitments.create({
      name: 'P27 Bitcoin',
      kind: CommitmentKind.INVESTMENT,
      subtype: CommitmentSubtype.CRYPTO,
      personId,
    })
    await commitments.addContribution(bitcoin.id, {
      date: new Date('2031-01-10'),
      amount: 200,
      quantity: 0.002,
      unit: 'BTC',
    })
    const second = await commitments.addContribution(bitcoin.id, { date: new Date('2031-02-10'), amount: 150.5 })

    const detail = await commitments.get(bitcoin.id)
    expect(detail).toEqual(expect.objectContaining({ progress: null, contributionCount: 2, contributedAmount: 350.5 }))
    expect(detail.contributions.map((row) => row.amount)).toEqual([150.5, 200])

    await commitments.deleteContribution(bitcoin.id, second.id)
    expect((await commitments.get(bitcoin.id)).contributedAmount).toBe(200)
  })

  it('should keep a boleta of an installment in the folder of its area and delete it from the disk with the attachment', async () => {
    const created = await create({ name: 'P27 Préstamo 3' })
    const installment = created.installments[0]

    const view = await attachments.upload(
      { refType: AttachmentRefType.FIXED_COST, refId: installment.id, kind: AttachmentKind.BOLETA },
      { buffer: Buffer.from(`boleta-${Date.now()}`), mimetype: 'image/png', originalname: 'cuota-1.png' },
    )
    const file = await prisma.attachment.findUniqueOrThrow({ where: { id: view.id }, include: { file: true } })
    fileIds.push(file.fileId)

    expect(file.file.status).toBe(StoredFileStatus.KEPT)
    expect(file.file.expiresAt).toBeNull()
    expect(file.file.storageKey).toMatch(/^test\/finance\/commitments\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/)
    expect(existsSync(onDisk(file.file.storageKey))).toBe(true)
    expect(view).toEqual(expect.objectContaining({ name: 'cuota-1.png', kind: 'boleta' }))
    expect((await commitments.get(created.id)).installments[0].attachmentCount).toBe(1)

    await attachments.delete(view.id)
    expect(existsSync(onDisk(file.file.storageKey))).toBe(false)
    expect((await prisma.storedFile.findUniqueOrThrow({ where: { id: file.fileId } })).status).toBe(
      StoredFileStatus.DELETED,
    )
  })

  it('should plan the Notion import: link the existing installment of the month, create the rest and warn about the gaps', async () => {
    await mkdir(join(tmp, 'Pago de Terreno'))
    await writeFile(
      join(tmp, 'Pago de Terreno', '🏡 San Bartolo abc_all.csv'),
      [
        'Nombre,Año,Boleta,Cuota,Estado,F. Vencimiento,Link,Mes,Persona,Precio,Recibo',
        'San Bartolo,2025,Pago%20de%20Terreno/x/cuota-1.jpg,01/48,Pagado,06/06/2025,,Junio,Brando,"1,042.00",',
        'San Bartolo,2025,,02/48,No iniciado,06/07/2025,,Julio,Brando,"1,042.00",',
      ].join('\n'),
    )
    const existing = await prisma.fixedCost.create({
      data: {
        description: 'Terreno',
        amount: 1042,
        personId,
        categoryId,
        paymentStatus: PaymentStatus.PAID,
        paymentMonth: 6,
        paymentYear: 2025,
      },
    })

    const plans = await new CommitmentsImporter(prisma).plan(tmp)
    const bartolo = plans.find((plan) => plan.source.name === 'Terreno San Bartolo')!

    expect(bartolo.rows).toHaveLength(48)
    expect(bartolo.rows[0]).toEqual(
      expect.objectContaining({
        action: 'link',
        linkId: existing.id,
        status: PaymentStatus.PAID,
        notes: 'Notion: boleta cuota-1.jpg',
      }),
    )
    expect(bartolo.rows.slice(1).every((row) => row.action === 'create')).toBe(true)
    expect(bartolo.rows[47]).toEqual(
      expect.objectContaining({ installment: '48/48', paymentMonth: 5, paymentYear: 2029, dueDate: '2029-05-06' }),
    )
    // The loans have no CSV here: their schedule is generated from the plan and it says so
    const bcp = plans.find((plan) => plan.source.name === 'BCP')!
    expect(bcp.found).toBe(false)
    expect(bcp.rows).toHaveLength(36)
    expect(bcp.warnings[0]).toContain('No encontré el CSV')
  })
})
