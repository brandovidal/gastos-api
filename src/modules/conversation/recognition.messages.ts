import { CardReconciliation } from '@/modules/recognition/recognition.service'

import { escapeHtml, formatAmount } from './conversation.messages'

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'setiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

// IO summary by category (P21): 0 expenses, it answers how the month adds up against what Kogane has
export function formatReconciliation(reconciliation: CardReconciliation): string {
  const { card, month, year, appTotal, registered, categories } = reconciliation
  const missing = Math.round((appTotal - registered) * 100) / 100
  const status =
    Math.abs(missing) < 0.01
      ? '✅ Cuadra con lo registrado.'
      : missing > 0
        ? `⚠️ Faltan ${formatAmount(missing, 'PEN')} por registrar (manda las capturas de los movimientos).`
        : `⚠️ Kogane tiene ${formatAmount(-missing, 'PEN')} más que la app: revisa /ultimos.`

  return [
    `📊 <b>${escapeHtml(card)} · ${MONTHS[month - 1]} ${year}</b>`,
    `App: ${formatAmount(appTotal, 'PEN')} · Kogane: ${formatAmount(registered, 'PEN')}`,
    status,
    '',
    ...categories.map(
      (category) => `• ${escapeHtml(category.name)}: ${formatAmount(category.amount, 'PEN')} (${category.count})`,
    ),
  ].join('\n')
}
