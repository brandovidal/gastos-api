import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export class CatalogItemInUseException extends AppException {
  constructor(details?: any) {
    super(HttpStatus.CONFLICT, 'CATALOG_ITEM_IN_USE', 'The catalog item is used by expenses or other items', details)
  }
}
