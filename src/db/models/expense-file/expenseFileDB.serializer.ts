import { Injectable } from '@nestjs/common'

import { ExpenseFile, Prisma } from '@/generated/prisma/client'
import { JsonHelper } from '@/commons/helpers/json.helper'

import { ExpenseFileDbDto, UpdateExpenseFileDbDto } from './expenseFileDB.dto'

@Injectable()
export class ExpenseFileDBSerializer {
  toDto(expenseFile: ExpenseFile): ExpenseFileDbDto {
    return {
      ...expenseFile,
      confidence: JsonHelper.parseObject<Record<string, number>>(expenseFile.confidence),
      missingFields: JsonHelper.parseArray(expenseFile.missingFields),
    }
  }

  toUpdateData(data: UpdateExpenseFileDbDto): Prisma.ExpenseFileUncheckedUpdateInput {
    const { confidence, missingFields, ...rest } = data

    return {
      ...rest,
      ...(confidence !== undefined && { confidence: JsonHelper.stringify(confidence) }),
      ...(missingFields !== undefined && { missingFields: JsonHelper.stringify(missingFields) }),
    }
  }
}
