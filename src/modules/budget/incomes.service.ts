import { Injectable } from '@nestjs/common'

import { Currency } from '@/commons/constants/expense.constant'
import { IncomeDBRepository } from '@/db/models/income/incomeDB.repository'

import { CreateIncomeDto, IncomeListQueryDto, UpdateIncomeDto } from './dto/request/budget.dto'

// Extra incomes (P19, D65): they add to the salary in the surplus of their month
@Injectable()
export class IncomesService {
  constructor(private readonly incomeDBRepository: IncomeDBRepository) {}

  list({ month, year }: IncomeListQueryDto) {
    return this.incomeDBRepository.findByMonth(month, year)
  }

  create({ month, year, currency, ...body }: CreateIncomeDto) {
    return this.incomeDBRepository.create({
      ...body,
      currency: currency ?? Currency.PEN,
      month: month ?? body.receivedAt.getUTCMonth() + 1,
      year: year ?? body.receivedAt.getUTCFullYear(),
    })
  }

  update(id: string, body: UpdateIncomeDto) {
    return this.incomeDBRepository.update(id, body)
  }

  delete(id: string) {
    return this.incomeDBRepository.delete(id)
  }
}
