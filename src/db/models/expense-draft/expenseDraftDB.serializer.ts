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
      sharedWith: toSharedExpense(expenseDraft.sharedWith),
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

// The first format ({ personIds, parts }, D68) is still read: every person owes one of `parts` equal parts
function toSharedExpense(value: string | null): SharedExpense | null {
  if (!value) return null
  const parsed = JsonHelper.parseObject<Partial<SharedExpense> & { personIds?: string[]; parts?: number }>(value)
  if (Array.isArray(parsed.shares)) return parsed.shares.length ? { shares: parsed.shares } : null
  if (Array.isArray(parsed.personIds) && parsed.parts) {
    return { shares: parsed.personIds.map((personId) => ({ personId, ratio: 1 / (parsed.parts as number) })) }
  }
  return null
}
