import { BudgetStatus } from '@/commons/constants/budget.constant'
import { forecast } from '@/modules/budget/budget.calculator'
import { BudgetAlert, BudgetService, CategoryBudgetLine } from '@/modules/budget/budget.service'

import { escapeHtml, formatAmount, MONTH_NAMES } from './conversation.messages'

// User-facing texts of the budget (P19), in Spanish: /presupuesto, /pronostico and the alert when saving

type MonthBudgetView = Awaited<ReturnType<BudgetService['month']>>

const BAR_LENGTH = 10
const NAME_WIDTH = 12
const pen = (amount: number) => formatAmount(amount, 'PEN')
const monthLabel = (month: number, year: number) => `${MONTH_NAMES[month - 1]} ${year}`

export const BUDGET_TEXTS = {
  noLimits: 'Aún no hay límites por categoría: ponlos en la web (Presupuesto ▸ Categorías).',
  noSalary: 'Sin sueldo registrado para este mes: ponlo en la web para ver el límite y el excedente.',
  monthUsage: 'Dime el mes así: <i>/presupuesto octubre</i>, <i>/presupuesto 10</i> o <i>/presupuesto 10 2026</i>.',
  forecastNoLimits:
    '🔮 Para el pronóstico necesito límites por categoría: ponlos en la web (Presupuesto ▸ Categorías).',
}

// "⚠️ Comida: 85 % del presupuesto" (threshold) / "🔴 Comida: 104 % del presupuesto" (over 100 %)
export const formatBudgetAlert = ({ category, percent, status }: BudgetAlert) =>
  `${status === BudgetStatus.OVER ? '🔴' : '⚠️'} ${escapeHtml(category)}: ${Math.round(percent)} % del presupuesto`

const statusMark = (line: CategoryBudgetLine) =>
  line.status === BudgetStatus.OVER ? ' 🔴' : line.status === BudgetStatus.WARNING ? ' ⚠️' : ''

// "Comida       ▓▓▓▓▓▓▓▓░░  85 %"
function barLine(line: CategoryBudgetLine): string {
  const percent = line.percent ?? 0
  const filled = Math.min(BAR_LENGTH, Math.floor(percent / 10))
  const name = line.name.length > NAME_WIDTH ? `${line.name.slice(0, NAME_WIDTH - 1)}…` : line.name.padEnd(NAME_WIDTH)
  const bar = '▓'.repeat(filled) + '░'.repeat(BAR_LENGTH - filled)
  return `${escapeHtml(name)} ${bar} ${String(Math.round(percent)).padStart(3)} %`
}

// /presupuesto [mes]: spent vs limit of the month, one bar per category with a limit, and the surplus (D65)
export function formatBudget(month: number, year: number, view: MonthBudgetView): string {
  const { budget, spentPen, extraIncome, surplus, byCategory } = view
  const lines = [`📊 <b>Presupuesto de ${monthLabel(month, year)}</b>`]

  if (budget) {
    const proposal = budget.isProposal ? ' <i>(sueldo del último mes, sin confirmar)</i>' : ''
    lines.push(
      `Gastado ${pen(spentPen)} de ${pen(budget.limit)} (${Math.round((spentPen / (budget.limit || 1)) * 100)} %)${proposal}`,
    )
  } else {
    lines.push(`Gastado ${pen(spentPen)}`, BUDGET_TEXTS.noSalary)
  }

  const limited = byCategory.filter((line) => line.limit != null)
  if (limited.length) {
    lines.push('', `<pre>${limited.map(barLine).join('\n')}</pre>`)
    const alerts = limited.filter((line) => line.status !== BudgetStatus.OK)
    if (alerts.length) {
      lines.push(
        alerts
          .map(
            (line) =>
              `${statusMark(line).trim()} ${escapeHtml(line.name)}: ${pen(line.spent)} de ${pen(line.limit ?? 0)}`,
          )
          .join('\n'),
      )
    }
  } else {
    lines.push('', BUDGET_TEXTS.noLimits)
  }

  const unlimited = byCategory.filter((line) => line.limit == null && line.spent > 0)
  if (unlimited.length) {
    lines.push('', `Sin límite: ${unlimited.map((line) => `${escapeHtml(line.name)} ${pen(line.spent)}`).join(' · ')}`)
  }

  if (extraIncome) lines.push(`Ingresos extra: ${pen(extraIncome)}`)
  if (surplus != null) lines.push(`${surplus < 0 ? '🔻' : '💰'} <b>Excedente: ${pen(surplus)}</b>`)
  return lines.join('\n')
}

// /pronostico: at this pace, which categories go over their limit, on which day, and what is left per day
export function formatForecast(
  month: number,
  year: number,
  day: number,
  daysInMonth: number,
  view: MonthBudgetView,
): string {
  const limited = view.byCategory.filter((line) => line.limit != null)
  if (!limited.length) return BUDGET_TEXTS.forecastNoLimits

  const lines = [`🔮 <b>Pronóstico de ${monthLabel(month, year)}</b> (día ${day} de ${daysInMonth})`]

  if (view.budget) {
    const total = forecast(view.spentPen, view.budget.limit, day, daysInMonth)
    lines.push(
      total.overBy > 0
        ? `A este ritmo terminas en ${pen(total.projected)}: te pasas ${pen(total.overBy)} del límite.`
        : `A este ritmo terminas en ${pen(total.projected)} de ${pen(total.limit)}. Vas bien.`,
    )
  }

  const rows = limited
    .map((line) => ({ line, result: forecast(line.spent, line.limit ?? 0, day, daysInMonth) }))
    .sort((a, b) => b.result.overBy - a.result.overBy)

  lines.push('')
  for (const { line, result } of rows) {
    const name = escapeHtml(line.name)
    if (result.spent >= result.limit) {
      lines.push(`🔴 ${name}: ya pasó el límite (${pen(result.spent)} de ${pen(result.limit)}).`)
    } else if (result.overBy > 0 && result.overDay) {
      lines.push(
        `⚠️ ${name}: a este ritmo se pasa ${pen(result.overBy)} y llega al límite el día ${result.overDay}. Te quedan ${pen(result.perDayLeft)}/día.`,
      )
    } else {
      lines.push(`✅ ${name}: va bien, ${pen(result.perDayLeft)}/día disponibles.`)
    }
  }
  return lines.join('\n')
}
