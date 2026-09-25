import { CatalogKind } from '@/commons/constants/expense-extraction.constant'
import { DebtDirection } from '@/commons/constants/debt.constant'
import { PaymentStatus, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import { ExtractionCatalog } from '@/modules/expense-extraction/dto/expense-extraction.types'

import { CsvRow } from './notion-csv'
import { MapContext, mapRow, NotionBase, detectBase } from './notion.mapper'
import { monthTotals } from './notion-importer'

const catalog: ExtractionCatalog = {
  promptText: '',
  entries: [
    { ref: 'p1', kind: CatalogKind.PERSON, id: 'me', name: 'Brando', aliases: ['yo'], isDefault: true },
    { ref: 'p2', kind: CatalogKind.PERSON, id: 'dany', name: 'Danery', aliases: ['dany'] },
    { ref: 'pm1', kind: CatalogKind.PAYMENT_METHOD, id: 'cmr', name: 'CMR', aliases: ['cmr'] },
    { ref: 'pm2', kind: CatalogKind.PAYMENT_METHOD, id: 'oh', name: 'Oh Pay', aliases: ['oh'] },
    { ref: 'pm3', kind: CatalogKind.PAYMENT_METHOD, id: 'ibk', name: 'Interbank', aliases: [] },
    { ref: 'cat1', kind: CatalogKind.CATEGORY, id: 'casa', name: 'Casa', aliases: [] },
  ],
}
const context: MapContext = { catalog, defaultPersonId: 'me', defaultCategoryId: 'personal' }
const row = (values: Record<string, string>, line = 2): CsvRow => ({ line, values })

describe('notion.mapper', () => {
  it('should tell each board from its exported file name, or from its columns', () => {
    expect(detectBase('💳 CMR 28dbcadcbe2081ae834ee91b4deb8e1f_all.csv', [])).toEqual({
      base: NotionBase.CARD,
      card: 'CMR',
    })
    expect(detectBase('💳 Oh 28dbcadcbe2081bf98f3faa35a6bb089.csv', [])).toEqual({ base: NotionBase.CARD, card: 'OH' })
    expect(detectBase('💳 IO 28dbcadcbe208121be76e5a2e957649e_all.csv', [])).toEqual({
      base: NotionBase.CARD,
      card: 'IO',
    })
    expect(detectBase('💵 Costos fijos abc.csv', [])).toEqual({ base: NotionBase.FIXED_COST })
    expect(detectBase('💸 Cuentas 28dbcadcbe20813fbba6e972dce16310_all.csv', [])).toEqual({ base: NotionBase.DEBT })
    expect(detectBase('💰 Relacion de gastos.csv', [])).toEqual({ base: NotionBase.BUDGET_GROUP })
    expect(detectBase('export.csv', ['Descripción', 'Sueldo'])).toEqual({ base: NotionBase.SUMMARY })
    expect(detectBase('export.csv', ['Descripción'])).toBeNull()
  })

  it('should import a card row without "Estado de pago" as "No iniciado"', () => {
    const [mapped] = mapRow(
      { base: NotionBase.CARD, card: 'CMR' },
      'cmr.csv',
      row({ Descripción: 'Uber', Pago: '12.50', 'Mes de pago': 'Setiembre', 'Año de pago': '2026', Persona: 'Danery' }),
      context,
    )

    expect(mapped).toMatchObject({ kind: 'expense', value: { data: { paymentStatus: PaymentStatus.NOT_STARTED } } })
  })

  it('should map a card row with its card, person, installment, status and period', () => {
    const [mapped] = mapRow(
      { base: NotionBase.CARD, card: 'CMR' },
      'cmr.csv',
      row({
        Descripción: 'MP*MERCADOLI',
        Pago: '164.90',
        'Mes de pago': 'Setiembre',
        'Año de pago': '2026',
        Cuota: '1/3',
        'Estado de pago': 'Pagado',
        'Fecha proceso': '15/09/2026',
        Persona: 'Danery',
        Tipo: 'Gasto con culpa',
        Observacion: 'mouse',
      }),
      context,
    )

    expect(mapped).toMatchObject({
      kind: 'expense',
      value: {
        table: 'creditCardExpense',
        month: 9,
        year: 2026,
        data: {
          description: 'MP*MERCADOLI',
          amount: 164.9,
          amountInPen: 164.9,
          paymentMethodId: 'cmr',
          personId: 'dany',
          installment: '1/3',
          paymentStatus: PaymentStatus.PAID,
          expenseType: 'guilty_pleasure',
          processDate: new Date('2026-09-15T00:00:00.000Z'),
          notes: 'mouse',
        },
      },
    })
  })

  it('should not import a row whose person, category or account is not in the catalog', () => {
    const mapped = mapRow(
      { base: NotionBase.FIXED_COST },
      'costos.csv',
      row({
        Descripción: 'Luz',
        Pago: '120',
        'Mes de pago': 'Setiembre',
        'Año de pago': '2026',
        Persona: 'Pepito',
        Categoria: 'Mascotas',
        Cuenta: 'Ripley',
      }),
      context,
    )

    expect(mapped.every((item) => item.kind === 'issue')).toBe(true)
    expect(mapped.map((item) => item.kind === 'issue' && item.value.message).sort()).toEqual([
      'categoría «Mascotas» no está en el catálogo',
      'cuenta «Ripley» no está en el catálogo',
      'persona «Pepito» no está en el catálogo',
    ])
  })

  it('should map a fixed cost with the default category and its three dates', () => {
    const [mapped] = mapRow(
      { base: NotionBase.FIXED_COST },
      'costos.csv',
      row({
        Descripción: 'Terreno',
        Pago: '1,042.00',
        Moneda: 'Soles(S/)',
        'Mes de pago': 'Setiembre',
        'Año de pago': '2026',
        Cuenta: 'Interbank',
        'Estado de pago': 'Amortizado',
        'Fecha limite': '01/09/2026',
        'Fecha pago': '05/09/2026',
      }),
      context,
    )

    expect(mapped).toMatchObject({
      kind: 'expense',
      value: {
        table: 'fixedCost',
        data: {
          categoryId: 'personal',
          paymentMethodId: 'ibk',
          personId: 'me',
          paymentStatus: PaymentStatus.PAID, // Amortizado is not a fixed-cost status
          dueDate: new Date('2026-09-01T00:00:00.000Z'),
          paymentDate: new Date('2026-09-05T00:00:00.000Z'),
        },
      },
    })
  })

  it('should map a platform to the owner with its period, and Exonerado to waived', () => {
    const [mapped] = mapRow(
      { base: NotionBase.SUBSCRIPTION },
      'plataformas.csv',
      row({
        Descripción: 'Netflix',
        Monto: 'S/44.90',
        'Mes de pago': 'Setiembre',
        'Año de pago': '2026',
        Periodo: 'Exonerado',
        Persona: 'Compartido',
        Cuenta: 'Oh Pay',
      }),
      context,
    )

    expect(mapped).toMatchObject({
      kind: 'expense',
      value: {
        table: 'subscription',
        data: {
          amount: 44.9,
          personId: 'me',
          paymentMethodId: 'oh',
          period: SubscriptionPeriod.MONTHLY,
          paymentStatus: PaymentStatus.WAIVED,
          notes: 'Compartido (Notion)',
        },
      },
    })
  })

  it('should map a debt paid in Notion with its payment, and warn about a partial one', () => {
    const paid = mapRow(
      { base: NotionBase.DEBT },
      'cuentas.csv',
      row({
        Descripción: 'Iphone',
        Pago: '400',
        'Mes de pago': 'Agosto',
        'Año de pago': '2026',
        Persona: 'dany',
        Cuota: '1/3',
        'Estado de pago': 'Pagado',
        'Fecha pago': '28/08/2026',
      }),
      context,
    )
    expect(paid).toMatchObject([
      {
        kind: 'expense',
        value: {
          table: 'debt',
          data: { direction: DebtDirection.OWED_TO_ME, personId: 'dany', installment: '1/3', currency: 'PEN' },
          paidInFull: { paidAt: new Date('2026-08-28T00:00:00.000Z') },
        },
      },
    ])

    const partial = mapRow(
      { base: NotionBase.DEBT },
      'cuentas.csv',
      row({
        Descripción: 'Iphone',
        Pago: '400',
        'Mes de pago': 'Setiembre',
        'Año de pago': '2026',
        Persona: 'Danery',
        'Estado de pago': 'Abonado',
      }),
      context,
    )
    expect(partial.map((item) => item.kind)).toEqual(['issue', 'expense'])
    expect(partial[0]).toMatchObject({ kind: 'issue', value: { blocking: false } })
  })

  it('should read the budget groups and the salary of each month', () => {
    expect(
      mapRow({ base: NotionBase.BUDGET_GROUP }, 'r.csv', row({ Nombre: 'Ahorros', 'Porcentaje (%)': '14' }), context),
    ).toEqual([{ kind: 'group', value: { name: 'Ahorros', percentage: 14 } }])
    expect(
      mapRow(
        { base: NotionBase.SUMMARY },
        's.csv',
        row({ Descripción: ' Resumen Setiembre 2026', Sueldo: '5000', Porcentaje: '80%', Gastos: '8,412.40' }),
        context,
      ),
    ).toEqual([
      { kind: 'budget', value: { month: 9, year: 2026, salary: 5000, limitPercent: 80, notionSpent: 8412.4 } },
    ])
  })

  it('should take the missing year from the row date and skip rows without an amount', () => {
    const card = { base: NotionBase.CARD, card: 'CMR' } as const
    const [abono] = mapRow(
      card,
      'io.csv',
      row({ Descripción: 'Abono con Oh Pay', 'Fecha proceso': '29/07/2024', 'Mes de pago': 'Agosto', Pago: '-100.00' }),
      context,
    )
    expect(abono).toMatchObject({ kind: 'expense', value: { month: 8, year: 2024, amount: -100 } })
    expect(
      mapRow(
        card,
        'io.csv',
        row({ Descripción: 'PedidosYa food', 'Mes de pago': 'Setiembre', 'Año de pago': '2026' }),
        context,
      ),
    ).toEqual([
      {
        kind: 'issue',
        value: { file: 'io.csv', line: 2, message: 'sin monto, se omite: «PedidosYa food»', blocking: false },
      },
    ])
  })

  it('should keep every Resumen page a row is linked to, and warn when there are several', () => {
    const mapped = mapRow(
      { base: NotionBase.FIXED_COST },
      'c.csv',
      row({
        Descripción: 'Bitel Brando',
        Pago: '39.90',
        'Mes de pago': 'Diciembre',
        'Año de pago': '2024',
        '💵 Resumen':
          'Resumen Diciembre 2024 (https://app.notion.com/p/Resumen-Diciembre-2024-1), Resumen Noviembre 2024 (https://app.notion.com/p/Resumen-Noviembre-2024-2)',
      }),
      context,
    )
    expect(mapped[0]).toMatchObject({ kind: 'issue', value: { blocking: false } })
    expect(mapped.at(-1)).toMatchObject({
      kind: 'expense',
      value: {
        summaries: [
          { month: 12, year: 2024 },
          { month: 11, year: 2024 },
        ],
      },
    })
  })

  it('should add up each month like the Notion Resumen: fixed costs and cards in soles, no platforms or debts', () => {
    const expense = (table: string, amount: number, currency = 'PEN') =>
      ({ table, amount, currency, month: 9, year: 2026, summaries: [{ month: 9, year: 2026 }] }) as never
    expect(
      monthTotals(
        [
          expense('fixedCost', 1042),
          expense('creditCardExpense', 164.9),
          expense('subscription', 44.9),
          expense('debt', 400),
          expense('creditCardExpense', 10, 'USD'),
        ],
        [{ month: 9, year: 2026, salary: 1000, limitPercent: 100, notionSpent: 1216.9 }],
      ),
    ).toEqual([
      // Notion adds up the linked rows in any currency: 1042 + 164.9 + 10
      { month: 9, year: 2026, spent: 1206.9, salary: 1000, surplus: -206.9, linked: 1216.9, notionSpent: 1216.9 },
    ])
  })
})
