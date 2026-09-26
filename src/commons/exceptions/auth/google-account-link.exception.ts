import { HttpStatus } from '@nestjs/common'

import { AppException } from '../app.exception'

export type GoogleAccountLinkReason = 'email_mismatch' | 'already_linked'

export class GoogleAccountLinkException extends AppException {
  constructor(reason: GoogleAccountLinkReason) {
    super(
      HttpStatus.CONFLICT,
      reason === 'email_mismatch' ? 'GOOGLE_EMAIL_MISMATCH' : 'GOOGLE_ALREADY_LINKED',
      reason === 'email_mismatch'
        ? 'The Google account email must match your Kogane account'
        : 'This Google account is already linked to another Kogane account',
    )
  }
}
