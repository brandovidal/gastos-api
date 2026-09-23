import { BotAction, MAX_INSTALLMENT_BUTTONS } from '@/commons/constants/conversation.constant'
import { DebtDirection, DebtTiming, toCents } from '@/commons/constants/debt.constant'
import { DebtView, PaymentProposal, PersonDebtSummary } from '@/modules/debts/debts.service'

import { encodeBotAction } from './bot-action.codec'
import { escapeHtml, formatAmount } from './conversation.messages'
import { BotButton, BotReply } from './dto/conversation.types'

// User-facing texts of loans and debts (P17), in Spanish
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

export const DEBT_TEXTS = {
  paymentExpired: 'Este abono ya no está pendiente. Escríbelo de nuevo.',
  paymentCancelled: '❌ <b>Abono cancelado</b>. No se guardó nada.',
  noDebts: '🎉 No hay deudas pendientes.',
  noDebtsWith: (name: string) => `🎉 No hay nada pendiente con <b>${escapeHtml(name)}</b>.`,
  unknownPerson: (text: string) =>
    `No encontré a <b>${escapeHtml(text)}</b> en tus personas. Prueba con el nombre o un alias (ej: <i>/deudas dany</i>).`,
  collectUsage: 'Dime a quién: <i>/cobrar dany</i>.',
  nothingToCollect: (name: string) => `🎉 <b>${escapeHtml(name)}</b> no te debe nada.`,
  pickInstallment: '¿A qué cuota va el abono?',
}

const period = (debt: DebtView) => `${MONTHS[debt.paymentMonth - 1]} ${debt.paymentYear}`
const installmentOf = (debt: DebtView) => (debt.installment ? ` ${debt.installment}` : '')
const conceptOf = (debt: DebtView) => `${escapeHtml(debt.description)}${installmentOf(debt)}`
const lateMark = (debt: DebtView) => (debt.timing === DebtTiming.LATE ? ' ⚠️ vencida' : '')

const button = (label: string, name: BotAction, batchId: string, value?: string): BotButton => ({
  label,
  data: encodeBotAction({ name, draftId: batchId, value }),
})

// "dany me pagó 150": what the payment covers, before saving it
export function buildPaymentProposalReply(proposal: PaymentProposal, edit = false): BotReply {
  const name = escapeHtml(proposal.items[0]?.debt.person.name ?? '')
  const total = toCents(proposal.items.reduce((sum, item) => sum + item.amount, 0))
  const title =
    proposal.direction === DebtDirection.I_OWE
      ? `💸 <b>Abono a ${name}</b>: ${formatAmount(total, 'PEN')}`
      : `💸 <b>Abono de ${name}</b>: ${formatAmount(total, 'PEN')}`

  const lines = proposal.items.map(({ debt, amount }) => {
    const after = toCents(debt.balance - amount)
    return `• ${conceptOf(debt)} (${period(debt)}): ${formatAmount(amount, debt.currency)} → ${
      after > 0 ? `saldo ${formatAmount(after, debt.currency)}` : 'pagada ✅'
    }`
  })
  const excess =
    proposal.excess > 0
      ? [`\n⚠️ Sobran ${formatAmount(proposal.excess, 'PEN')}: no hay más cuotas pendientes, no los guardo.`]
      : []

  return {
    text: [title, ...lines, ...excess].join('\n'),
    edit,
    buttons: [
      [button('✅ Confirmar', BotAction.PAY_CONFIRM, proposal.batchId)],
      [
        button('✏️ Elegir cuota', BotAction.PAY_LIST, proposal.batchId),
        button('❌ Cancelar', BotAction.PAY_CANCEL, proposal.batchId),
      ],
    ],
  }
}

// ✏️ Elegir cuota: one button per open installment of that person
export function buildInstallmentPickerReply(batchId: string, open: DebtView[]): BotReply {
  return {
    text: DEBT_TEXTS.pickInstallment,
    edit: true,
    buttons: [
      ...open
        .slice(0, MAX_INSTALLMENT_BUTTONS)
        .map((debt) => [
          button(
            `${debt.description}${installmentOf(debt)} · ${period(debt)} · ${formatAmount(debt.balance, debt.currency)}`,
            BotAction.PAY_PICK,
            batchId,
            debt.id,
          ),
        ]),
      [button('❌ Cancelar', BotAction.PAY_CANCEL, batchId)],
    ],
  }
}

export function buildPaymentSavedReply(updated: DebtView[]): BotReply {
  const lines = updated.map(
    (debt) =>
      `• ${conceptOf(debt)} (${period(debt)}): ${
        debt.balance > 0 ? `saldo ${formatAmount(debt.balance, debt.currency)}` : 'pagada ✅'
      }`,
  )
  return { text: ['✅ <b>Abono guardado</b>', ...lines].join('\n'), edit: true }
}

// /deudas: me debe · le debo · neto per person
export function formatDebtSummary(rows: PersonDebtSummary[]): string {
  if (!rows.length) return DEBT_TEXTS.noDebts

  const owedToMe = toCents(rows.reduce((sum, row) => sum + row.owedToMe, 0))
  const iOwe = toCents(rows.reduce((sum, row) => sum + row.iOwe, 0))

  return [
    '<b>Deudas</b>',
    ...rows.map((row) => {
      const parts = [
        row.owedToMe > 0 ? `te debe ${formatAmount(row.owedToMe, 'PEN')}` : null,
        row.iOwe > 0 ? `le debes ${formatAmount(row.iOwe, 'PEN')}` : null,
        row.late > 0 ? `⚠️ ${formatAmount(row.late, 'PEN')} vencido` : null,
      ].filter(Boolean)
      return `• ${escapeHtml(row.name)}: ${parts.join(' · ')}`
    }),
    '',
    `Te deben ${formatAmount(owedToMe, 'PEN')} · debes ${formatAmount(iOwe, 'PEN')} · neto ${formatAmount(toCents(owedToMe - iOwe), 'PEN')}`,
    'Detalle: <i>/deudas dany</i> · cobrar: <i>/cobrar dany</i>',
  ].join('\n')
}

// /deudas dany: every open installment, cuota por cuota
export function formatPersonDebts(name: string, open: DebtView[]): string {
  if (!open.length) return DEBT_TEXTS.noDebtsWith(name)

  const section = (title: string, debts: DebtView[]) =>
    debts.length
      ? [
          `\n<b>${title}</b>`,
          ...debts.map((debt) => {
            const paid = debt.paidAmount > 0 ? ` (abonado ${formatAmount(debt.paidAmount, debt.currency)})` : ''
            return `• ${conceptOf(debt)} · ${period(debt)} · ${formatAmount(debt.balance, debt.currency)}${paid}${lateMark(debt)}`
          }),
        ]
      : []

  const owed = open.filter((debt) => debt.direction === DebtDirection.OWED_TO_ME)
  const mine = open.filter((debt) => debt.direction === DebtDirection.I_OWE)
  return [`<b>${escapeHtml(name)}</b>`, ...section('Te debe', owed), ...section('Le debes', mine)].join('\n')
}

// /cobrar dany: a message to forward, without buttons or internal data
export function formatCollectMessage(name: string, owed: DebtView[]): string {
  if (!owed.length) return DEBT_TEXTS.nothingToCollect(name)

  const total = toCents(owed.reduce((sum, debt) => sum + debt.balance, 0))
  return [
    `Hola ${escapeHtml(name)} 👋, te paso el detalle de lo pendiente:`,
    ...owed.map(
      (debt) =>
        `• ${escapeHtml(debt.description)}${debt.installment ? ` (cuota ${debt.installment})` : ''}, ${period(debt)}: ${formatAmount(debt.balance, debt.currency)}`,
    ),
    '',
    `<b>Total: ${formatAmount(total, 'PEN')}</b>`,
    '¡Gracias! 🙌',
  ].join('\n')
}
