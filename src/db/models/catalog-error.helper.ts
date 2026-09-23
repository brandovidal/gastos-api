import { PrismaErrorCode } from '@/commons/constants/database.constant'
import { isPrismaError } from '@/commons/helpers/prisma-error.helper'
import { CatalogItemDuplicateException } from '@/commons/exceptions/catalog/catalog-item-duplicate.exception'
import { CatalogItemInUseException } from '@/commons/exceptions/catalog/catalog-item-in-use.exception'
import { CatalogItemNotFoundException } from '@/commons/exceptions/catalog/catalog-item-not-found.exception'

// Catalog repositories never leak Prisma errors
export function toCatalogError(error: unknown, entity: string, id?: string): unknown {
  if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) return new CatalogItemNotFoundException({ entity, id })
  if (isPrismaError(error, PrismaErrorCode.UNIQUE_CONSTRAINT)) return new CatalogItemDuplicateException({ entity })
  if (isPrismaError(error, PrismaErrorCode.FOREIGN_KEY_CONSTRAINT)) return new CatalogItemInUseException({ entity, id })
  return error
}
