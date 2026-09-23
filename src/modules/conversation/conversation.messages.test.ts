import { ExpenseDestination } from '@/commons/constants/expense.constant'
import { ExpenseFileStatus } from '@/commons/constants/expense-file.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'

import { decodeBotAction } from './bot-action.codec'
import {
  buildExpenseReply,
  formatAmount,
  formatMonthlyTotals,
  formatRecent,
  formatSummary,
} from './conversation.messages'
import { buildExpenseFile, mockCatalog } from './mocks/conversation.mock'

describe('conversation messages', () => {
  it('should format amounts by currency', () => {
    expect(formatAmount(25, 'PEN')).toBe('S/ 25.00')
    expect(formatAmount(9.9, 'USD')).toBe('US$ 9.90')
    expect(formatAmount(null, 'PEN')).toBe('—')
  })

  it('should summarize the expense with catalog names and ❓ on doubtful fields', () => {
    const summary = formatSummary(buildExpenseFile({ confidence: { personId: 0.4 } }), mockCatalog)

    expect(summary).toContain('🧾 <b>Almuerzo</b> — S/ 25.00')
    expect(summary).toContain('👤 Danery ❓')
    expect(summary).toContain('💳 Yape')
    expect(summary).toContain('📂 Comida')
    expect(summary).toContain('📅 22/09/2026 · Costo fijo · Esencial')
  })

  it('should escape HTML coming from the user', () => {
    expect(formatSummary(buildExpenseFile({ description: '<b>x</b> & y' }), mockCatalog)).toContain(
      '&lt;b&gt;x&lt;/b&gt; &amp; y',
    )
  })

  it('should show the confirmation buttons when nothing is missing', () => {
    const reply = buildExpenseReply(buildExpenseFile(), mockCatalog)

    expect(reply.buttons?.flat().map((button) => button.label)).toEqual([
      '✅ Guardar',
      '✏️ Corregir',
      '📥 Bandeja',
      '❌ Descartar',
    ])
  })

  it('should ask the pending field with quick replies from the catalog', () => {
    const reply = buildExpenseReply(
      buildExpenseFile({ status: ExpenseFileStatus.DRAFT, pendingField: ExpenseField.PAYMENT_METHOD }),
      mockCatalog,
    )
    const buttons = reply.buttons?.flat() ?? []

    expect(reply.text).toContain('¿Con qué pagaste?')
    expect(buttons.map((button) => button.label)).toEqual(['Yape', 'OhPay', '❌ Descartar'])
    expect(decodeBotAction(buttons[1].data)).toMatchObject({
      field: ExpenseField.PAYMENT_METHOD,
      value: 'method-ohpay',
    })
    expect(buttons.every((button) => Buffer.byteLength(button.data) <= 64)).toBe(true)
  })

  it('should offer every destination but "discard" when asking the type', () => {
    const reply = buildExpenseReply(
      buildExpenseFile({ status: ExpenseFileStatus.DRAFT, pendingField: ExpenseField.DESTINATION, destination: null }),
      mockCatalog,
    )

    expect(reply.buttons?.flat().map((button) => button.label)).toEqual([
      'Costo fijo',
      'Plataforma',
      'Tarjeta',
      'Me deben',
      '❌ Descartar',
    ])
  })

  it('should list recent expenses', () => {
    expect(formatRecent([buildExpenseFile()])).toContain('• 22/09/2026 Almuerzo — S/ 25.00 (Costo fijo)')
    expect(formatRecent([])).toBe('Todavía no guardaste gastos desde aquí.')
  })

  it('should total the month per destination and per person', () => {
    const text = formatMonthlyTotals(
      [
        {
          destination: ExpenseDestination.FIXED_COST,
          currency: 'PEN',
          personId: 'person-brando',
          total: 100,
          count: 2,
        },
        {
          destination: ExpenseDestination.CREDIT_CARD,
          currency: 'USD',
          personId: 'person-brando',
          total: 10,
          count: 1,
        },
        { destination: ExpenseDestination.RECEIVABLE, currency: 'PEN', personId: 'person-danery', total: 50, count: 1 },
      ],
      mockCatalog,
      'setiembre 2026',
    )

    expect(text).toContain('<b>Resumen de setiembre 2026</b>')
    expect(text).toContain('• Costo fijo: S/ 100.00')
    expect(text).toContain('• Tarjeta: US$ 10.00')
    expect(text).toContain('• Me deben (pendiente): S/ 50.00')
    expect(text).toContain('• Brando: S/ 100.00 + US$ 10.00')
    expect(text).not.toContain('• Danery')
  })
})
