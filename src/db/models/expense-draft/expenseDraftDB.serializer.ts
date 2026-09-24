import { Injectable } from '@nestjs/common'

import { ExpenseDraft, Prisma } from '@/generated/prisma/client'
import { JsonHelper } from '@/commons/helpers/json.helper'

import { ExpenseDraftDbDto, SharedExpense, UpdateExpenseDraftDbDto } from './expenseDraftDB.dto'

@Injectable()
export class ExpenseDraftDBSerializer {
  toDto(expenseDraft: ExpenseDraft): ExpenseDraftDbDto {
    return {
      ...expenseDraft,
      confidence: JsonHelper.parseObject<Record<string, number>>(expenseDraft.confidence),
      missingFields: JsonHelper.parseArray(expenseDraft.missingFields),
      sharedWith: expenseDraft.sharedWith ? JsonHelper.parseObject<SharedExpense>(expenseDraft.sharedWith) : null,
    }
  }

  toUpdateData(data: UpdateExpenseDraftDbDto): Prisma.ExpenseDraftUncheckedUpdateInput {
    const { confidence, missingFields, sharedWith, ...rest } = data

    return {
      ...rest,
      ...(confidence !== undefined && { confidence: JsonHelper.stringify(confidence) }),
      ...(missingFields !== undefined && { missingFields: JsonHelper.stringify(missingFields) }),
      ...(sharedWith !== undefined && { sharedWith: sharedWith ? JsonHelper.stringify(sharedWith) : null }),
    }
  }
}
