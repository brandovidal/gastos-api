export enum PaymentMethodType {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  WALLET = 'wallet',
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
}

// Who holds a credit card (D116): the titular pays the bank; additional cards are other people's purchases on it
export enum CardHolderRole {
  TITULAR = 'titular',
  ADDITIONAL = 'additional',
}
