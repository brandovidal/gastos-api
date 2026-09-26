import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { CommitmentKind, CommitmentStatus, CommitmentSubtype } from '@/commons/constants/commitment.constant'
import { Currency, ExpenseType, PaymentStatus } from '@/commons/constants/expense.constant'
import { installmentNumber, plannedInstallments } from '@/commons/helpers/commitment.helper'
import { PrismaService } from '@/db/prisma/prisma.service'
import { runAsImport } from '@/db/audit/audit-context'
import { AuditAction } from '@/commons/constants/audit.constant'
import { parseCsv } from '@/modules/imports/notion/notion-csv'
import { dateOf, installmentOf, moneyOf, paymentStatusOf } from '@/modules/imports/notion/notion.values'

// The three commitments of the "Pago de Terreno" and "Pago de Prestamos" pages of Notion (P27, D99). The plan of each
// one (installments, amount, day, start) is what the user reported; Notion only says which ones are paid.
export interface CommitmentSource {
  name: string
  description: string // what its installments are called in Costos fijos
  folder: string // inside the export
  file: string // the CSV starts with this and ends with _all.csv
  kind: CommitmentKind
  subtype: CommitmentSubtype
  entity: string
  installmentCount: number
  installmentAmount: number
  dueDay: number
  startMonth: number
  startYear: number
  category: string
  cancellationAmount?: number
  // Fixed costs that already exist for it (imported from Costos fijos): linked instead of duplicated
  existing?: RegExp
}

export const COMMITMENT_SOURCES: CommitmentSource[] = [
  {
    name: 'BCP',
    description: 'BCP',
    folder: 'Pago de Prestamos',
    file: '💸 BCP',
    kind: CommitmentKind.LOAN,
    subtype: CommitmentSubtype.LOAN,
    entity: 'BCP',
    installmentCount: 36,
    installmentAmount: 1950.76,
    dueDay: 5,
    startMonth: 10,
    startYear: 2025,
    category: 'Prestamo',
    cancellationAmount: 42172.79,
  },
  {
    name: 'Compartamos Financiera',
    description: 'Compartamos Financiera',
    folder: 'Pago de Prestamos',
    file: '💸 Compartamos Financiera',
    kind: CommitmentKind.LOAN,
    subtype: CommitmentSubtype.LOAN,
    entity: 'Compartamos Financiera',
    installmentCount: 12,
    installmentAmount: 675,
    dueDay: 4,
    startMonth: 10,
    startYear: 2025,
    category: 'Prestamo',
  },
  {
    name: 'Terreno San Bartolo',
    description: 'Terreno',
    folder: 'Pago de Terreno',
    file: '🏡 San Bartolo',
    kind: CommitmentKind.INVESTMENT,
    subtype: CommitmentSubtype.LAND,
    entity: 'San Bartolo',
    installmentCount: 48,
    installmentAmount: 1042,
    dueDay: 6,
    startMonth: 6,
    startYear: 2025,
    category: 'Casa',
    existing: /^terreno$/i,
  },
]

export type InstallmentAction = 'exists' | 'link' | 'create'

export interface InstallmentImport {
  number: number
  installment: string
  paymentMonth: number
  paymentYear: number
  dueDate: string
  amount: number
  status: PaymentStatus
  action: InstallmentAction
  linkId?: string // the fixed cost to link
  notes: string | null
}

export interface CommitmentImport {
  source: CommitmentSource
  found: boolean // the CSV was in the folder
  commitmentExists: boolean
  rows: InstallmentImport[]
  warnings: string[]
}

export interface CommitmentsResult {
  commitments: number
  created: number
  linked: number
}

const attachmentNotes = (values: Record<string, string>): string | null => {
  const name = (path: string) => decodeURIComponent(path.split('/').pop() ?? path)
  const parts = [
    values['Boleta'] && `boleta ${name(values['Boleta'])}`,
    values['Recibo'] && `recibo ${name(values['Recibo'])}`,
    (values['Link'] || values['Files & media']) && (values['Link'] || values['Files & media']),
  ].filter(Boolean)
  return parts.length ? `Notion: ${parts.join(' · ')}` : null
}

const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

// Preview and apply: without CONFIRM nothing is written. Running it again changes nothing (an installment that is
// already linked to its commitment is left as it is)
export class CommitmentsImporter {
  constructor(private readonly prisma: PrismaService) {}

  async plan(dir: string): Promise<CommitmentImport[]> {
    const plans: CommitmentImport[] = []
    for (const source of COMMITMENT_SOURCES) plans.push(await this.planOne(source, dir))
    return plans
  }

  async apply(plans: CommitmentImport[]): Promise<CommitmentsResult> {
    // One event in the history for the whole import, not a row per installment (P29, D103)
    return runAsImport(
      this.prisma,
      { entity: 'exp_commitments', entityId: 'notion-commitments', action: AuditAction.CREATE },
      () => this.applyPlans(plans),
    )
  }

  private async applyPlans(plans: CommitmentImport[]): Promise<CommitmentsResult> {
    const owner = await this.prisma.person.findFirst({ where: { isDefault: true } })
    if (!owner) throw new Error('No hay una persona por defecto (Yo): corre make seed')
    const result: CommitmentsResult = { commitments: 0, created: 0, linked: 0 }

    for (const plan of plans) {
      const { source } = plan
      const category = await this.categoryOf(source)
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.commitment.findFirst({ where: { name: source.name } })
        const commitment =
          existing ??
          (await tx.commitment.create({
            data: {
              name: source.name,
              kind: source.kind,
              subtype: source.subtype,
              entity: source.entity,
              currency: Currency.PEN,
              totalAmount: Math.round(source.installmentCount * source.installmentAmount * 100) / 100,
              installmentCount: source.installmentCount,
              installmentAmount: source.installmentAmount,
              dueDay: source.dueDay,
              startMonth: source.startMonth,
              startYear: source.startYear,
              cancellationAmount: source.cancellationAmount ?? null,
              cancellationDate: source.cancellationAmount ? new Date() : null,
              status: CommitmentStatus.ACTIVE,
              personId: owner.id,
              categoryId: category,
            },
          }))
        if (!existing) result.commitments++

        for (const row of plan.rows) {
          if (row.action === 'exists') continue
          if (row.action === 'link') {
            await tx.fixedCost.update({
              where: { id: row.linkId },
              data: {
                commitmentId: commitment.id,
                installment: row.installment,
                dueDate: new Date(`${row.dueDate}T00:00:00.000Z`),
                ...(row.notes ? { notes: row.notes } : {}),
              },
            })
            result.linked++
            continue
          }
          await tx.fixedCost.create({
            data: {
              description: source.description,
              amount: row.amount,
              amountInPen: row.amount,
              currency: Currency.PEN,
              expenseType: ExpenseType.ESSENTIAL,
              paymentStatus: row.status,
              personId: commitment.personId,
              categoryId: category,
              installment: row.installment,
              paymentMonth: row.paymentMonth,
              paymentYear: row.paymentYear,
              dueDate: new Date(`${row.dueDate}T00:00:00.000Z`),
              notes: row.notes,
              commitmentId: commitment.id,
            },
          })
          result.created++
        }
      })
    }
    return result
  }

  private async categoryOf(source: CommitmentSource): Promise<string> {
    const category = await this.prisma.category.findFirst({ where: { name: source.category } })
    if (!category) throw new Error(`No existe la categoría "${source.category}" (${source.name}): corre make seed`)
    return category.id
  }

  private async planOne(source: CommitmentSource, dir: string): Promise<CommitmentImport> {
    const warnings: string[] = []
    const csv = await this.readCsv(source, dir)
    if (!csv)
      warnings.push(`No encontré el CSV "${source.folder}/${source.file}…_all.csv": se generan las cuotas del plan`)

    const commitment = await this.prisma.commitment.findFirst({ where: { name: source.name } })
    const linked = commitment ? await this.prisma.fixedCost.findMany({ where: { commitmentId: commitment.id } }) : []
    const linkedNumbers = new Set(linked.map((row) => installmentNumber(row.installment)))
    const unlinked = source.existing
      ? (await this.prisma.fixedCost.findMany({ where: { commitmentId: null } })).filter((row) =>
          source.existing!.test(row.description.trim()),
        )
      : []

    const notion = new Map<number, Record<string, string>>()
    for (const { values, line } of csv ?? []) {
      const installment = installmentOf(values['Cuota'] ?? '')
      if (!installment) continue
      const number = Number(installment.split('/')[0])
      if (installment.split('/')[1] !== String(source.installmentCount)) {
        warnings.push(`Línea ${line}: ${installment} no es de un plan de ${source.installmentCount} cuotas`)
      }
      notion.set(number, values)
      if (values['Comentarios'])
        warnings.push(`Cuota ${installment}: el comentario "${values['Comentarios']}" no se importa`)
    }

    const rows: InstallmentImport[] = plannedInstallments(source).map((planned) => {
      const values = notion.get(planned.number)
      const status = (values && paymentStatusOf(values['Estado'] ?? '')) || PaymentStatus.NOT_STARTED
      const amount = (values && moneyOf(values['Precio'] ?? '')) || planned.amount
      const notionDue = values ? dateOf(values['F. Vencimiento'] ?? '') : null
      if (notionDue && notionDue !== planned.dueDate) {
        warnings.push(
          `Cuota ${planned.installment}: vence ${fmt(notionDue)} en Notion, se usa ${fmt(planned.dueDate)} del plan`,
        )
      }
      if (amount !== planned.amount) {
        warnings.push(`Cuota ${planned.installment}: ${amount} en Notion, el plan dice ${planned.amount}`)
      }
      const row: InstallmentImport = {
        number: planned.number,
        installment: planned.installment,
        paymentMonth: planned.paymentMonth,
        paymentYear: planned.paymentYear,
        dueDate: planned.dueDate,
        amount,
        status,
        action: 'create',
        notes: values ? attachmentNotes(values) : null,
      }
      if (linkedNumbers.has(planned.number)) return { ...row, action: 'exists' }

      const candidate = unlinked.find(
        (fixedCost) => fixedCost.paymentMonth === planned.paymentMonth && fixedCost.paymentYear === planned.paymentYear,
      )
      if (!candidate) return row
      unlinked.splice(unlinked.indexOf(candidate), 1)
      return { ...row, action: 'link', linkId: candidate.id, status: candidate.paymentStatus as PaymentStatus }
    })

    if (source.existing && unlinked.length) {
      warnings.push(
        `${unlinked.length} costo(s) fijo(s) "${source.description}" quedan sin vincular (${unlinked
          .map((row) => `${row.paymentMonth}/${row.paymentYear}`)
          .join(', ')}): no son cuotas del plan`,
      )
    }
    return { source, found: csv !== null, commitmentExists: commitment !== null, rows, warnings }
  }

  private async readCsv(source: CommitmentSource, dir: string) {
    const folder = join(dir, source.folder)
    const names = await readdir(folder).catch(() => [] as string[])
    const name = names.find((entry) => entry.startsWith(source.file) && entry.endsWith('_all.csv'))
    if (!name) return null
    return parseCsv(await readFile(join(folder, name), 'utf8')).rows
  }
}
