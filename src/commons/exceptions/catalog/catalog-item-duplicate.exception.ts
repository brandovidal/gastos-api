import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class CatalogItemDuplicateException extends AppException {
  constructor(details?: any) {
    super(
      HttpStatus.CONFLICT,
      'CATALOG_ITEM_DUPLICATE',
      'A catalog item with the same name or code already exists',
      details,
    )
  }
}
