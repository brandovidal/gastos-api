// P27 (D99): imports the loans and the land of Notion ("Pago de Prestamos" and "Pago de Terreno") as commitments.
// Without --confirm it only prints the report. The installments that already exist in Costos fijos (the "Terreno"
// rows) are linked to their commitment instead of duplicated.
// Usage: make import-commitments [DIR=<folder with the two pages>] [CONFIRM=yes] [ENV=prod]
import { ConfigService } from '@nestjs/config'

import { PrismaService } from '../src/db/prisma/prisma.service'
import { CommitmentsImporter } from '../src/modules/commitments/notion/commitments-importer'

async function main() {
  const args = process.argv.slice(2)
  const dir = args.find((arg) => !arg.startsWith('--'))
  const confirm = args.includes('--confirm')
  if (!dir)
    throw new Error(
      'Usage: make import-commitments DIR=<folder with "Pago de Prestamos" and "Pago de Terreno"> [CONFIRM=yes]',
    )

  const url = process.env.DATABASE_URL
  const prisma = new PrismaService(new ConfigService({ db: { url, authToken: process.env.DATABASE_AUTH_TOKEN } }))
  await prisma.onModuleInit()
  const importer = new CommitmentsImporter(prisma)

  try {
    const remote = !!url?.startsWith('libsql://')
    console.log(`Base de datos: ${url?.split('?')[0]}${remote ? '  ⚠️  REMOTA (Turso)' : ''}\n`)

    const plans = await importer.plan(dir)
    for (const plan of plans) {
      const count = (action: string) => plan.rows.filter((row) => row.action === action).length
      const paid = plan.rows.filter((row) => row.status === 'paid').length
      console.log(
        `${plan.source.name.padEnd(24)} ${plan.commitmentExists ? 'ya existe' : 'nuevo    '}  ${plan.rows.length} cuotas: ${count('create')} nuevas, ${count('link')} vinculadas, ${count('exists')} ya estaban · ${paid} pagadas`,
      )
      plan.warnings.forEach((warning) => console.log(`  ⚠️  ${warning}`))
    }

    if (!confirm) {
      console.log('\nSolo informe: nada se guardó. Revisa y corre de nuevo con CONFIRM=yes.')
      return
    }
    console.log('\nGuardado:', await importer.apply(plans))
  } finally {
    await prisma.onModuleDestroy()
  }
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
