import { Notification } from '@/generated/prisma/client'
import { CalendarEventKind, CalendarEventStatus } from '@/commons/constants/calendar.constant'
import { BotAction } from '@/commons/constants/conversation.constant'
import { NotificationKind, NotificationOp, NotificationRefType } from '@/commons/constants/notification.constant'
import { CalendarEvent } from '@/modules/calendar/calendar.service'
import { decodeBotAction } from '@/modules/conversation/bot-action.codec'

import {
  buildCalendarReply,
  buildInstallmentsReply,
  dueNotice,
  notificationButtons,
  shortDate,
} from './notification.messages'

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  date: '2026-09-25',
  kind: CalendarEventKind.CARD_DUE,
  name: 'IO',
  personName: null,
  installment: null,
  amount: 389.71,
  currency: 'PEN',
  status: CalendarEventStatus.PENDING,
  refType: NotificationRefType.CARD_STATEMENT,
  refId: 'io@2026-09',
  color: null,
  ...overrides,
})

const notification = (overrides: Partial<Notification>): Notification =>
  ({ id: 'cmuftw90s0000befscv71ju1o', kind: NotificationKind.DUE, refType: null, ...overrides }) as Notification

describe('notification.messages', () => {
  it('should write the day with its weekday', () => {
    expect(shortDate('2026-09-25')).toBe('vie 25/09')
  })

  it('should write each kind of due reminder', () => {
    expect(dueNotice(event({}))).toMatchObject({
      kind: NotificationKind.DUE,
      title: '💳 Pago de IO',
      body: 'Vence mañana (vie 25/09): S/ 389.71 por pagar del estado de cuenta.',
      dedupeKey: 'due:card_due:io@2026-09:2026-09-25',
    })
    expect(dueNotice(event({ kind: CalendarEventKind.CARD_CLOSE, amount: null }))).toMatchObject({
      kind: NotificationKind.CARD_CLOSE,
      body: 'IO cierra mañana (vie 25/09): lo que compres desde el sáb 26/09 va al siguiente estado de cuenta.',
    })
    expect(
      dueNotice(
        event({
          kind: CalendarEventKind.DEBT_OWED_TO_ME,
          name: 'Préstamo',
          personName: 'Danery',
          installment: '2/5',
          amount: 50,
        }),
      ),
    ).toMatchObject({ title: '🤝 Danery te debe', body: 'Préstamo 2/5: S/ 50.00 vence mañana (vie 25/09).' })
  })

  it('should offer ✅ Pagado and ✏️ on what can be paid, and 🔕 on every notice, within 64 bytes', () => {
    const due = notificationButtons(notification({ refType: NotificationRefType.FIXED_COST }))
    expect(due.map((row) => row.map((button) => button.label))).toEqual([
      ['✅ Pagado', '✏️ Editar monto'],
      ['🔕 Silenciar'],
    ])
    expect(decodeBotAction(due[0][0].data)).toEqual({
      name: BotAction.NOTIFY,
      draftId: 'cmuftw90s0000befscv71ju1o',
      value: NotificationOp.PAID,
    })
    expect(due.flat().every((button) => Buffer.byteLength(button.data) <= 64)).toBe(true)

    const card = notificationButtons(notification({ refType: NotificationRefType.CARD_STATEMENT }))
    expect(card[0].map((button) => button.label)).toEqual(['✅ Pagado'])

    const weekly = notificationButtons(notification({ kind: NotificationKind.WEEKLY }))
    expect(weekly.flat().map((button) => button.label)).toEqual(['🔕 Silenciar', '📅 Calendario', '💰 Presupuesto'])
  })

  it('should list the next days grouped by day, without what is paid', () => {
    const reply = buildCalendarReply(
      [
        event({}),
        event({
          kind: CalendarEventKind.FIXED_COST,
          name: 'Luz',
          amount: 120,
          status: CalendarEventStatus.LATE,
          date: '2026-09-24',
        }),
        event({ kind: CalendarEventKind.SUBSCRIPTION, name: 'Netflix', status: CalendarEventStatus.PAID }),
      ].sort((a, b) => a.date.localeCompare(b.date)),
      14,
    )

    expect(reply.text).toBe(
      '📅 <b>Próximos 14 días</b>\n\n<b>jue 24/09</b>\n• 🏠 Luz · S/ 120.00 ⏰\n\n<b>vie 25/09</b>\n• 💳 Pago IO · S/ 389.71',
    )
    expect(buildCalendarReply([], 14).text).toBe('📅 Nada por pagar en los próximos 14 días. 🎉')
  })

  it('should show the installments per month and card with the ones still to generate', () => {
    const reply = buildInstallmentsReply({
      months: [
        { month: 10, year: 2026, total: 164.9 },
        { month: 11, year: 2026, total: 0 },
      ],
      cards: [
        {
          paymentMethodId: 'io',
          name: 'IO',
          color: null,
          total: 164.9,
          months: [
            { month: 10, year: 2026, amount: 164.9, count: 1, estimated: 1 },
            { month: 11, year: 2026, amount: 0, count: 0, estimated: 0 },
          ],
        },
      ],
      items: [],
    })

    expect(reply.text).toBe(
      '💳 <b>Cuotas de tarjeta de los próximos 2 meses</b>\n\n<b>octubre 2026</b>: S/ 164.90\n• IO: S/ 164.90 en 1 cuota (1 por generar)\n\n<b>noviembre 2026</b>: S/ 0.00',
    )
  })
})
