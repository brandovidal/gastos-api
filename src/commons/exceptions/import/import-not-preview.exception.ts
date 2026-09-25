import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

// Only a preview can be applied or discarded: the batch does not exist, or it was already applied or discarded
export class ImportNotPreviewException extends AppException {
  constructor(details?: { batchId: string; status: string | null }) {
    super(
      details?.status ? HttpStatus.CONFLICT : HttpStatus.NOT_FOUND,
      'IMPORT_NOT_PREVIEW',
      details?.status ? 'The import is not a preview anymore' : 'Import not found',
      details,
    )
  }
}
