import { createZodDto } from 'nestjs-zod'

import {
  categoryBudgetQuerySchema,
  createIncomeSchema,
  incomeListQuerySchema,
  updateIncomeSchema,
  updateBudgetSettingsSchema,
  upsertCategoryBudgetSchema,
} from '../../validations/budget.validation'

export class IncomeListQueryDto extends createZodDto(incomeListQuerySchema) {}
export class CreateIncomeDto extends createZodDto(createIncomeSchema) {}
export class UpdateIncomeDto extends createZodDto(updateIncomeSchema) {}
export class CategoryBudgetQueryDto extends createZodDto(categoryBudgetQuerySchema) {}
export class UpsertCategoryBudgetDto extends createZodDto(upsertCategoryBudgetSchema) {}
export class UpdateBudgetSettingsDto extends createZodDto(updateBudgetSettingsSchema) {}
