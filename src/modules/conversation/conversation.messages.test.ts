import { ExpenseDestination } from '@/commons/constants/expense.constant'
import { ExpenseDraftStatus } from '@/commons/constants/expense-draft.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'

import { decodeBotAction } from './bot-action.codec'
import {
  buildExpenseReply,
  buildDraftReplies,
  buildNewPaymentMethodReply,
  toNewPaymentMethodName,
  formatAmount,
  formatMonthlyTotals,
  formatRecent,
  formatSummary,
} from './conversation.messages'
import { buildExpenseDraft, FILE_ID, mockCatalog } from './mocks/conversation.mock'

describe('conversation messages', () => {
  it('should format amounts by currency', () => {
    expect(formatAmount(25, 'PEN')).toBe('S/ 25.00')
    expect(formatAmount(9.9, 'USD')).toBe('US$ 9.90')
    expect(formatAmount(null, 'PEN')).toBe('—')
  })

  it('should summarize the expense with catalog names and ❓ on doubtful fields', () => {
    const summary = formatSummary(buildExpenseDraft({ confidence: { personId: 0.4 } }), mockCatalog)

    expect(summary).toContain('🧾 <b>Almuerzo</b> — S/ 25.00')
    expect(summary).toContain('👤 Danery ❓')
    expect(summary).toContain('💳 Yape')
    expect(summary).toContain('📂 Comida')
    expect(summary).toContain('📅 22/09/2026 · Costo fijo · Esencial')
  })

  it('should escape HTML coming from the user', () => {
    expect(formatSummary(buildExpenseDraft({ description: '<b>x</b> & y' }), mockCatalog)).toContain(
      '&lt;b&gt;x&lt;/b&gt; &amp; y',
    )
  })

  it('should show the confirmation buttons when nothing is missing', () => {
    const reply = buildExpenseReply(buildExpenseDraft(), mockCatalog)

    expect(reply.buttons?.flat().map((button) => button.label)).toEqual([
      '✅ Guardar',
      '✏️ Corregir',
      '📝 Borrador',
      '❌ Descartar',
    ])
  })

  it('should ask the pending field with quick replies from the catalog', () => {
    const reply = buildExpenseReply(
      buildExpenseDraft({ status: ExpenseDraftStatus.DRAFT, pendingField: ExpenseField.PAYMENT_METHOD }),
      mockCatalog,
    )
    const buttons = reply.buttons?.flat() ?? []

    expect(reply.text).toContain('¿Con qué pagaste?')
    // Every payment method marked to show in the bot, cards included; "Tarjeta Oculta" is hidden
    expect(buttons.map((button) => button.label)).toEqual(['OhPay', 'Yape', '❌ Descartar'])
    expect(decodeBotAction(buttons[0].data)).toMatchObject({
      field: ExpenseField.PAYMENT_METHOD,
      value: 'method-ohpay',
    })
    expect(buttons.every((button) => Buffer.byteLength(button.data) <= 64)).toBe(true)
  })

  it('should offer every destination but "discard" when asking the type', () => {
    const reply = buildExpenseReply(
      buildExpenseDraft({
        status: ExpenseDraftStatus.DRAFT,
        pendingField: ExpenseField.DESTINATION,
        destination: null,
      }),
      mockCatalog,
    )

    expect(reply.buttons?.flat().map((button) => button.label)).toEqual([
      'Día a día',
      'Costo fijo',
      'Plataforma',
      'Tarjeta',
      'Me deben',
      '❌ Descartar',
    ])
  })

  it('should list recent expenses', () => {
    expect(formatRecent([buildExpenseDraft()])).toContain('• 22/09/2026 Almuerzo — S/ 25.00 (Costo fijo)')
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

  it('should list Borrador with Retomar and Descartar, showing the raw text of failed ones', () => {
    const replies = buildDraftReplies(
      [
        buildExpenseDraft({ status: ExpenseDraftStatus.PENDING_REVIEW }),
        buildExpenseDraft({ id: 'failed-1', status: ExpenseDraftStatus.FAILED, rawText: 'algo raro <b>' }),
      ],
      7,
      mockCatalog,
    )

    expect(replies[0].text).toContain('Borrador</b> (7) · mostrando los 2 más recientes')
    expect(replies[1].text).toContain('Almuerzo')
    expect(replies[1].buttons?.[0].map((button) => button.label)).toEqual(['↩️ Retomar', '❌ Descartar'])
    expect(decodeBotAction(replies[1].buttons?.[0][0].data ?? '')).toEqual({ name: 're', draftId: FILE_ID })
    expect(replies[2].text).toContain('algo raro &lt;b&gt;')
    expect(buildDraftReplies([], 0, mockCatalog)).toEqual([{ text: '📝 No hay nada pendiente en Borrador.' }])
  })

  it('should offer to create an unknown payment method, one button per type, under 64 bytes', () => {
    const reply = buildNewPaymentMethodReply(FILE_ID, toNewPaymentMethodName('Tarjeta Ripley: la dorada con puntos'))
    const buttons = reply.buttons?.flat() ?? []

    expect(reply.text).toContain('No conozco <b>Tarjeta Ripley la do</b>')
    expect(buttons.map((button) => button.label)).toEqual([
      'Débito',
      'Billetera',
      'Tarjeta de crédito',
      'Efectivo',
      'No',
    ])
    expect(decodeBotAction(buttons[2].data)).toEqual({
      name: 'new',
      draftId: FILE_ID,
      field: 'credit_card',
      value: 'Tarjeta Ripley la do',
    })
    expect(decodeBotAction(buttons[4].data)).toEqual({ name: 'new', draftId: FILE_ID })
    expect(buttons.every((button) => Buffer.byteLength(button.data) <= 64)).toBe(true)
  })
})
