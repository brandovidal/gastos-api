// P14 (D90): imports the CSV exports of the Notion boards. Without --confirm it only prints the report.
// Usage: make import-notion DIR=docs/files/notion [CONFIRM=yes] [RESET=yes] [ENV=prod]
import { ConfigService } from '@nestjs/config'

import { PrismaService } from '../src/db/prisma/prisma.service'
import { baseLabel, NotionImporter } from '../src/modules/imports/notion/notion-importer'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
const money = (value: number | null) => (value == null ? '—' : value.toFixed(2).padStart(11))

async function main() {
  const args = process.argv.slice(2)
  const dir = args.find((arg) => !arg.startsWith('--'))
  const confirm = args.includes('--confirm')
  const reset = args.includes('--reset')
  if (!dir) throw new Error('Usage: make import-notion DIR=<folder with the CSV files> [CONFIRM=yes] [RESET=yes]')

  const url = process.env.DATABASE_URL
  const prisma = new PrismaService(new ConfigService({ db: { url, authToken: process.env.DATABASE_AUTH_TOKEN } }))
  await prisma.onModuleInit()
  const importer = new NotionImporter(prisma)

  try {
    console.log(`Base de datos: ${url?.split('?')[0]}\n`)
    if (reset && confirm) {
      console.log('RESET: borrado lo importado de Notion', await importer.reset(), '\n')
    }

    const plan = await importer.plan(dir)
    console.log('Archivos:')
    plan.files.forEach(({ file, base, rows }) =>
      console.log(`  ${baseLabel(base).padEnd(18)} ${String(rows).padStart(5)} filas  ${file}`),
    )

    const newRows = plan.expenses.filter((expense) => !expense.exists).length
    console.log(
      `\nGastos y deudas: ${plan.expenses.length} (${newRows} nuevos, ${plan.expenses.length - newRows} ya importados)`,
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

    console.log('\nPor mes (como el Resumen de Notion: costos fijos + tarjetas, soles):')
    console.log('  mes         gastos      sueldo   excedente')
    plan.months.forEach((total) =>
      console.log(
        `  ${MONTHS[total.month - 1]} ${total.year} ${money(total.spent)} ${money(total.salary)} ${money(total.surplus)}`,
      ),
    )

    if (!confirm) {
      console.log('\nSolo informe: nada se guardó. Revisa y corre de nuevo con CONFIRM=yes.')
      return
    }
    console.log('\nGuardado:', await importer.apply(plan))
  } finally {
    await prisma.onModuleDestroy()
  }
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
