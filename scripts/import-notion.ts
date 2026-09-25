// P14 (D90, D104): imports the CSV exports of the Notion boards. Without --confirm it only prints the report; with it,
// it saves the preview and applies it right away (the web does the same in two steps).
// Usage: make import-notion [DIR=<folder>] [CONFIRM=yes] [RESET=yes] [ENV=prod]
import { ConfigService } from '@nestjs/config'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import { PrismaService } from '../src/db/prisma/prisma.service'
import { baseLabel, NotionImporter, readNotionDir } from '../src/modules/imports/notion/notion-importer'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
const money = (value: number | null) => (value == null ? '—' : value.toFixed(2).padStart(11))

// The migrations in prisma/migrations not applied to this database: Turso records them in _app_migrations
// (scripts/db-deploy.ts), a local SQLite file in _prisma_migrations
async function pendingMigrations(prisma: PrismaService): Promise<string[]> {
  const all = readdirSync(join(__dirname, '..', 'prisma', 'migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('_app_migrations', '_prisma_migrations')",
  )
  const query = tables.some((table) => table.name === '_app_migrations')
    ? 'SELECT name FROM _app_migrations'
    : 'SELECT migration_name AS name FROM _prisma_migrations WHERE finished_at IS NOT NULL'
  const applied = new Set((await prisma.$queryRawUnsafe<{ name: string }[]>(query)).map((row) => row.name))
  return all.filter((name) => !applied.has(name)).sort()
}

async function main() {
  const args = process.argv.slice(2)
  const dir = args.find((arg) => !arg.startsWith('--'))
  const confirm = args.includes('--confirm')
  const reset = args.includes('--reset')
  const resetOnly = args.includes('--reset-only')
  if (!dir) throw new Error('Usage: make import-notion DIR=<folder with the CSV files> [CONFIRM=yes] [RESET=yes]')

  const url = process.env.DATABASE_URL
  const prisma = new PrismaService(new ConfigService({ db: { url, authToken: process.env.DATABASE_AUTH_TOKEN } }))
  await prisma.onModuleInit()
  const importer = new NotionImporter(prisma)

  try {
    const remote = !!url?.startsWith('libsql://')
    console.log(`Base de datos: ${url?.split('?')[0]}${remote ? '  ⚠️  REMOTA (Turso)' : ''}\n`)

    const pending = await pendingMigrations(prisma)
    if (pending.length) {
      throw new Error(
        `Faltan ${pending.length} migraciones en esta base (${pending.join(', ')}). Corre primero make db-deploy con el mismo ENV.`,
      )
    }
    if (resetOnly) {
      console.log('RESET: borrado lo importado de Notion', await importer.reset())
      return
    }
    if (reset && confirm) {
      console.log('RESET: borrado lo importado de Notion', await importer.reset(), '\n')
    }

    const plan = await importer.plan(await readNotionDir(dir), dir)
    console.log('Archivos:')
    plan.files.forEach(({ file, base, rows }) =>
      console.log(`  ${baseLabel(base).padEnd(18)} ${String(rows).padStart(5)} filas  ${file}`),
    )

    const count = (status: string) => plan.expenses.filter((expense) => expense.status === status).length
    console.log(
      `\nGastos y deudas: ${plan.expenses.length} (${count('new')} nuevos, ${count('changed')} cambiaron en Notion, ${count('unchanged')} iguales: no se tocan)`,
    )
    console.log(`Grupos de presupuesto: ${plan.groups.length} · Meses con sueldo: ${plan.budgets.length}`)

    const blocking = plan.issues.filter((issue) => issue.blocking)
    const warnings = plan.issues.filter((issue) => !issue.blocking)
    if (blocking.length) {
      console.log(
        `\n⛔ ${blocking.length} filas no se importan hasta corregirlas (agrega el nombre o alias en el seed y corre make seed):`,
      )
      blocking.forEach((issue) => console.log(`  ${issue.file}:${issue.line}  ${issue.message}`))
    }
    if (warnings.length) {
      console.log(`\n⚠️  ${warnings.length} avisos:`)
      warnings.forEach((issue) => console.log(`  ${issue.file}:${issue.line}  ${issue.message}`))
    }

    console.log(
      '\nPor mes (costos fijos + tarjetas; Notion suma las filas enlazadas a cada Resumen, no el mes de pago):',
    )
    console.log('  mes         gastos      sueldo   excedente   enlazadas      Notion')
    plan.months.forEach((total) => {
      const check = total.notionSpent == null ? '' : Math.abs(total.linked - total.notionSpent) < 0.01 ? '  ✅' : '  ❌'
      console.log(
        `  ${MONTHS[total.month - 1]} ${total.year} ${money(total.spent)} ${money(total.salary)} ${money(total.surplus)} ${money(total.linked)} ${money(total.notionSpent)}${check}`,
      )
    })
    const checked = plan.months.filter((total) => total.notionSpent != null)
    const matching = checked.filter((total) => Math.abs(total.linked - total.notionSpent!) < 0.01).length
    console.log(`\nCuadran con el Resumen de Notion: ${matching} de ${checked.length} meses.`)

    if (!confirm) {
      console.log('\nSolo informe: nada se guardó. Revisa y corre de nuevo con CONFIRM=yes.')
      return
    }
    console.log(
      '\nGuardado:',
      await importer.apply(await importer.preview(plan), (done, total) => {
        if (done === total || done % 1000 < 200) console.log(`  … ${done} de ${total}`)
      }),
    )
  } finally {
    await prisma.onModuleDestroy()
  }
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
