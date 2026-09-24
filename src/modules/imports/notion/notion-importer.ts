import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { PrismaService } from '@/db/prisma/prisma.service'
import { DebtDBRepository } from '@/db/models/debt/debtDB.repository'
import { Currency } from '@/commons/constants/expense.constant'
import { toCents } from '@/commons/constants/debt.constant'
import { buildExtractionCatalog, normalizeText } from '@/modules/expense-extraction/expense-extraction.catalog'
import { PersonDbDto } from '@/db/models/person/personDB.dto'
import { PaymentMethodDbDto } from '@/db/models/payment-method/paymentMethodDB.dto'

import { parseCsv } from './notion-csv'
import {
  BaseFile,
  detectBase,
  ExpenseImport,
  GroupImport,
  ImportIssue,
  ImportTable,
  mapRow,
  MapContext,
  MonthlyBudgetImport,
  NotionBase,
} from './notion.mapper'

export interface MonthTotal {
  month: number
  year: number
  spent: number // PEN, like "Gastos" of the Notion Resumen: fixed costs + cards, everyone's (D46: no platforms)
  salary: number | null
  surplus: number | null // salary − spent
}

export interface ImportPlan {
  files: { file: string; base: BaseFile | null; rows: number }[]
  expenses: (ExpenseImport & { importKey: string; exists: boolean })[]
  groups: GroupImport[]
  budgets: MonthlyBudgetImport[]
  issues: ImportIssue[]
  months: MonthTotal[]
}

export interface ApplyResult {
  created: number
  updated: number
  payments: number
  groups: number
  budgets: number
}

const TABLES: ImportTable[] = ['creditCardExpense', 'fixedCost', 'subscription', 'debt']

type Delegate = {
  findMany(args: unknown): Promise<{ importKey: string | null }[]>
  upsert(args: unknown): Promise<{ id: string }>
  deleteMany(args: unknown): Promise<{ count: number }>
}

const hash = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 20)

// Notion → Kogane once in production, many times in dev (P14, D90). Every row carries an importKey (a fingerprint of
// the row plus its occurrence), so importing again updates instead of duplicating, and RESET deletes only what came
// from Notion.
export class NotionImporter {
  private readonly debts: DebtDBRepository

  constructor(private readonly prisma: PrismaService) {
    this.debts = new DebtDBRepository(prisma)
  }

  async plan(dir: string): Promise<ImportPlan> {
    const context = await this.context()
    const plan: ImportPlan = { files: [], expenses: [], groups: [], budgets: [], issues: [], months: [] }
    const occurrences = new Map<string, number>()

    const names = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith('.csv')).sort()
    for (const file of names) {
      const { headers, rows } = parseCsv(await readFile(join(dir, file), 'utf8'))
      const base = detectBase(file, headers)
      plan.files.push({ file, base, rows: rows.length })
      if (!base) {
        plan.issues.push({
          file,
          line: 1,
          message: 'no sé qué base de Notion es (renómbralo con su nombre)',
          blocking: true,
        })
        continue
      }
      for (const row of rows) {
        for (const mapped of mapRow(base, file, row, context)) {
          if (mapped.kind === 'issue') plan.issues.push(mapped.value)
          if (mapped.kind === 'group') plan.groups.push(mapped.value)
          if (mapped.kind === 'budget') plan.budgets.push(mapped.value)
          if (mapped.kind === 'expense') {
            const occurrence = (occurrences.get(mapped.value.fingerprint) ?? 0) + 1
            occurrences.set(mapped.value.fingerprint, occurrence)
            plan.expenses.push({
              ...mapped.value,
              importKey: `notion:${hash(mapped.value.fingerprint)}#${occurrence}`,
              exists: false,
            })
          }
        }
      }
    }

    const existing = new Set<string>()
    for (const table of TABLES) {
      const rows = await this.delegate(table).findMany({
        where: { importKey: { not: null } },
        select: { importKey: true },
      })
      rows.forEach((row) => existing.add(row.importKey!))
    }
    plan.expenses.forEach((expense) => (expense.exists = existing.has(expense.importKey)))
    plan.months = monthTotals(plan.expenses, plan.budgets)
    return plan
  }

  // Saves the plan: rows by importKey (created or updated), the payments of the debts paid in Notion (only once),
  // the budget groups by name and the salary of each month
  async apply(plan: ImportPlan): Promise<ApplyResult> {
    const result: ApplyResult = { created: 0, updated: 0, payments: 0, groups: 0, budgets: 0 }

    for (const expense of plan.expenses) {
      const data = { ...expense.data, importKey: expense.importKey }
      const saved = await this.delegate(expense.table).upsert({
        where: { importKey: expense.importKey },
        create: data,
        update: data,
      })
      if (expense.exists) result.updated++
      else result.created++

      if (expense.table === 'debt' && expense.paidInFull) {
        const debt = await this.prisma.debt.findUnique({ where: { id: saved.id }, include: { payments: true } })
        if (debt && !debt.payments.length) {
          await this.debts.addPayment({
            debtId: debt.id,
            amount: debt.amount,
            paidAt: expense.paidInFull.paidAt,
            paymentMethodId: null,
            notes: 'Pagado en Notion',
          })
          result.payments++
        }
      }
    }

    const groups = await this.prisma.budgetGroup.findMany()
    for (const group of plan.groups) {
      const match = groups.find((candidate) => normalizeText(candidate.name) === normalizeText(group.name))
      if (match) {
        await this.prisma.budgetGroup.update({ where: { id: match.id }, data: { percentage: group.percentage } })
      } else {
        await this.prisma.budgetGroup.create({ data: { name: group.name, percentage: group.percentage } })
      }
      result.groups++
    }

    for (const budget of plan.budgets) {
      await this.prisma.monthlyBudget.upsert({
        where: { month_year: { month: budget.month, year: budget.year } },
        create: budget,
        update: { salary: budget.salary, limitPercent: budget.limitPercent },
      })
      result.budgets++
    }
    return result
  }

  // RESET (dev): deletes every row that came from Notion (the payments of the debts go with them)
  async reset(): Promise<Record<ImportTable, number>> {
    const deleted = {} as Record<ImportTable, number>
    for (const table of TABLES) {
      deleted[table] = (await this.delegate(table).deleteMany({ where: { importKey: { not: null } } })).count
    }
    return deleted
  }

  private async context(): Promise<MapContext> {
    const [people, paymentMethods, categories] = await Promise.all([
      this.prisma.person.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.paymentMethod.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.category.findMany({ orderBy: { name: 'asc' } }),
    ])
    const aliases = (value: string) => {
      try {
        return JSON.parse(value) as string[]
      } catch {
        return []
      }
    }
    const catalog = buildExtractionCatalog({
      people: people.map((person) => ({ ...person, aliases: aliases(person.aliases) })) as PersonDbDto[],
      paymentMethods: paymentMethods.map((method) => ({
        ...method,
        aliases: aliases(method.aliases),
      })) as PaymentMethodDbDto[],
      categories,
    })
    const owner = people.find((person) => person.isDefault)
    if (!owner) throw new Error('No default person in the catalog: run make seed first')
    return {
      catalog,
      defaultPersonId: owner.id,
      defaultCategoryId: categories.find((category) => category.isDefault)?.id ?? null,
    }
  }

  private delegate(table: ImportTable): Delegate {
    return this.prisma[table] as unknown as Delegate
  }
}

// Totals per payment month, as the Notion Resumen adds them, to compare month by month before saving
export function monthTotals(expenses: ExpenseImport[], budgets: MonthlyBudgetImport[]): MonthTotal[] {
  const totals = new Map<string, MonthTotal>()
  const keyOf = (month: number, year: number) => `${year}-${String(month).padStart(2, '0')}`
  const entry = (month: number, year: number) => {
    const key = keyOf(month, year)
    const current = totals.get(key) ?? { month, year, spent: 0, salary: null, surplus: null }
    totals.set(key, current)
    return current
  }

  for (const expense of expenses) {
    if (expense.currency !== Currency.PEN) continue
    if (expense.table !== 'fixedCost' && expense.table !== 'creditCardExpense') continue
    const total = entry(expense.month, expense.year)
    total.spent = toCents(total.spent + expense.amount)
  }
  for (const budget of budgets) entry(budget.month, budget.year).salary = budget.salary
  for (const total of totals.values()) {
    total.surplus = total.salary == null ? null : toCents(total.salary - total.spent)
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, total]) => total)
}

export const baseLabel = (base: BaseFile | null) =>
  !base
    ? '¿?'
    : base.base === NotionBase.CARD
      ? `tarjeta ${base.card}`
      : {
          [NotionBase.FIXED_COST]: 'costos fijos',
          [NotionBase.SUBSCRIPTION]: 'plataformas',
          [NotionBase.DEBT]: 'cuentas (deudas)',
          [NotionBase.BUDGET_GROUP]: 'relación de gastos',
          [NotionBase.SUMMARY]: 'resumen',
          [NotionBase.CARD]: 'tarjeta',
        }[base.base]
