import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class CatalogItemNotFoundException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.NOT_FOUND, 'CATALOG_ITEM_NOT_FOUND', 'Catalog item not found', details)
  }
}
