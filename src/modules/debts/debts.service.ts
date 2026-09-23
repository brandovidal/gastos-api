import { randomUUID } from 'node:crypto'

import { Injectable } from '@nestjs/common'

import { APP_TIME_ZONE } from '@/commons/constants/app.constant'
import { DebtDirection, DebtTiming, toCents } from '@/commons/constants/debt.constant'
import { Currency } from '@/commons/constants/expense.constant'
import { DateHelper } from '@/commons/helpers/date.helper'
import { allocatePayment, balanceOf, debtTiming } from '@/commons/helpers/debt.helper'
import { addMonths } from '@/commons/helpers/payment-period.helper'
import { DebtPaymentExceedsBalanceException } from '@/commons/exceptions/debt/debt-payment-exceeds-balance.exception'
import { DebtDBRepository } from '@/db/models/debt/debtDB.repository'
import { DebtWithPersonDbDto } from '@/db/models/debt/debtDB.dto'

import { CreateDebtDto, DebtListQueryDto, DebtPaymentDto, UpdateDebtDto } from './dto/request/debts.dto'

// Batch ids travel in Telegram callback_data next to a debt id (64 bytes): keep them short
const BATCH_ID_LENGTH = 20

export type DebtView = DebtWithPersonDbDto & { balance: number; timing: DebtTiming }

export interface PersonDebtSummary {
  personId: string
  name: string
  owedToMe: number // balance, PEN
  iOwe: number
  net: number // positive: the person owes the user
  late: number // balance of late installments owed to the user
  dueThisMonth: number
}

export interface PaymentProposal {
  batchId: string
  personId: string
  direction: DebtDirection
  items: { debt: DebtView; amount: number }[]
  excess: number
}

// Loans and debts (P17, D60): the web API and the bot share this service
@Injectable()
export class DebtsService {
  constructor(private readonly debtDBRepository: DebtDBRepository) {}

  async list({ personId, direction, status }: DebtListQueryDto): Promise<DebtView[]> {
    const debts = await this.debtDBRepository.findMany({ personId, direction, statuses: status ? [status] : undefined })
    return debts.map((debt) => this.toView(debt))
  }

  async findOpen(personId?: string, direction?: DebtDirection): Promise<DebtView[]> {
    const debts = await this.debtDBRepository.findOpen({ personId, direction })
    return debts.map((debt) => this.toView(debt))
  }

  async get(id: string) {
    const debt = await this.debtDBRepository.findById(id)
    return { ...this.toView(debt), payments: debt.payments }
  }

  // Me debe · le debo · neto per person, in soles (other currencies stay out until they have an exchange rate)
  async summary(): Promise<PersonDebtSummary[]> {
    const open = (await this.findOpen()).filter((debt) => debt.currency === Currency.PEN)
    const byPerson = new Map<string, PersonDebtSummary>()

    for (const debt of open) {
      const row = byPerson.get(debt.personId) ?? {
        personId: debt.personId,
        name: debt.person.name,
        owedToMe: 0,
        iOwe: 0,
        net: 0,
        late: 0,
        dueThisMonth: 0,
      }
      if (debt.direction === DebtDirection.I_OWE) {
        row.iOwe = toCents(row.iOwe + debt.balance)
      } else {
        row.owedToMe = toCents(row.owedToMe + debt.balance)
        if (debt.timing === DebtTiming.LATE) row.late = toCents(row.late + debt.balance)
        if (debt.timing === DebtTiming.DUE) row.dueThisMonth = toCents(row.dueThisMonth + debt.balance)
      }
      row.net = toCents(row.owedToMe - row.iOwe)
      byPerson.set(debt.personId, row)
    }

    return [...byPerson.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
  }

  async create({ installments = 1, ...body }: CreateDebtDto) {
    const period = { paymentMonth: body.paymentMonth, paymentYear: body.paymentYear }
    return this.debtDBRepository.createMany(
      Array.from({ length: installments }, (_, index) => ({
        ...body,
        amountInPen: body.currency && body.currency !== Currency.PEN ? null : body.amount,
        installment: installments > 1 ? `${index + 1}/${installments}` : null,
        ...addMonths(period, index),
      })),
    )
  }

  update(id: string, body: UpdateDebtDto) {
    return this.debtDBRepository.update(id, body)
  }

  delete(id: string) {
    return this.debtDBRepository.delete(id)
  }

  async addPayment(id: string, { amount, paidAt, paymentMethodId, notes }: DebtPaymentDto) {
    const debt = await this.debtDBRepository.findById(id)
    const balance = balanceOf(debt)
    if (toCents(amount) > balance) throw new DebtPaymentExceedsBalanceException({ id, amount, balance })

    return this.debtDBRepository.addPayment({
      debtId: id,
      amount: toCents(amount),
      paidAt: paidAt ?? new Date(),
      paymentMethodId: paymentMethodId ?? null,
      notes: notes ?? null,
    })
  }

  deletePayment(id: string, paymentId: string) {
    return this.debtDBRepository.deletePayment(id, paymentId)
  }

  // Bot: "dany me pagó 150" covers the oldest installments first; nothing is saved until ✅ Confirmar.
  // null when that person has nothing open in that direction (then the message is read as a new expense).
  async proposePayment(personId: string, direction: DebtDirection, amount: number): Promise<PaymentProposal | null> {
    const open = await this.findOpen(personId, direction)
    if (!open.length) return null

    const { allocations, excess } = allocatePayment(open, amount)
    const batchId = randomUUID().replace(/-/g, '').slice(0, BATCH_ID_LENGTH)
    await this.debtDBRepository.replaceProposal(batchId, allocations, new Date(), null)

    return this.toProposal(batchId, personId, direction, open, allocations, excess)
  }

  // ✏️ Elegir cuota: the whole amount of the proposal goes to one installment (up to its balance)
  async pickInstallment(batchId: string, debtId: string): Promise<PaymentProposal | null> {
    const current = await this.debtDBRepository.findProposal(batchId)
    if (!current.length) return null

    const { personId, direction } = current[0].debt
    const total = toCents(current.reduce((sum, payment) => sum + payment.amount, 0))
    const open = await this.findOpen(personId, direction as DebtDirection)
    const debt = open.find((candidate) => candidate.id === debtId)
    if (!debt) return null

    const amount = Math.min(total, debt.balance)
    const allocations = [{ debtId, amount }]
    await this.debtDBRepository.replaceProposal(batchId, allocations, current[0].paidAt, null)

    return this.toProposal(batchId, personId, direction as DebtDirection, open, allocations, toCents(total - amount))
  }

  async findProposal(batchId: string): Promise<PaymentProposal | null> {
    const payments = await this.debtDBRepository.findProposal(batchId)
    if (!payments.length) return null

    const { personId, direction } = payments[0].debt
    return {
      batchId,
      personId,
      direction: direction as DebtDirection,
      items: payments.map((payment) => ({ debt: this.toView(payment.debt), amount: payment.amount })),
      excess: 0,
    }
  }

  // Returns the installments after the payment (with their new balance), or null when the proposal expired
  async confirmPayment(batchId: string): Promise<DebtView[] | null> {
    const proposal = await this.debtDBRepository.findProposal(batchId)
    if (!proposal.length) return null

    const updated = await this.debtDBRepository.confirmProposal(batchId)
    const people = new Map(proposal.map((payment) => [payment.debt.id, payment.debt.person]))
    return updated.map((debt) => this.toView({ ...debt, person: people.get(debt.id)! }))
  }

  cancelPayment(batchId: string) {
    return this.debtDBRepository.discardProposal(batchId)
  }

  private toProposal(
    batchId: string,
    personId: string,
    direction: DebtDirection,
    open: DebtView[],
    allocations: { debtId: string; amount: number }[],
    excess: number,
  ): PaymentProposal {
    const byId = new Map(open.map((debt) => [debt.id, debt]))
    return {
      batchId,
      personId,
      direction,
      items: allocations.map(({ debtId, amount }) => ({ debt: byId.get(debtId)!, amount })),
      excess,
    }
  }

  private toView(debt: DebtWithPersonDbDto): DebtView {
    const today = DateHelper.todayIn(APP_TIME_ZONE)
    return { ...debt, balance: balanceOf(debt), timing: debtTiming(debt, today) }
  }
}
