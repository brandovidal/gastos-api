import { ExpenseDestination } from './expense.constant'

export const MAX_EXPENSES_PER_MESSAGE = 10

// Fields below this confidence are shown with ❓ in the confirmation summary
export const LOW_CONFIDENCE_THRESHOLD = 0.6

export enum ExpenseField {
  DESTINATION = 'destination',
  DESCRIPTION = 'description',
  AMOUNT = 'amount',
  CURRENCY = 'currency',
  SPENT_AT = 'spentAt',
  EXPENSE_TYPE = 'expenseType',
  INSTALLMENT = 'installment',
  PERIOD = 'period',
  PERSON = 'personId',
  PAYMENT_METHOD = 'paymentMethodId',
  CATEGORY = 'categoryId',
  MERCHANT = 'merchant',
  OPERATION_NUMBER = 'operationNumber',
  NOTES = 'notes',
}

// The person is never asked: without one the expense belongs to the default person (Person.isDefault)
const BASE_REQUIRED_FIELDS = [ExpenseField.DESCRIPTION, ExpenseField.AMOUNT]

// Fields the bot must ask for before an expense can be saved
export const REQUIRED_FIELDS_BY_DESTINATION: Record<ExpenseDestination, ExpenseField[]> = {
  [ExpenseDestination.DAILY]: [...BASE_REQUIRED_FIELDS, ExpenseField.PAYMENT_METHOD],
  [ExpenseDestination.FIXED_COST]: [...BASE_REQUIRED_FIELDS, ExpenseField.CATEGORY, ExpenseField.PAYMENT_METHOD],
  [ExpenseDestination.SUBSCRIPTION]: [...BASE_REQUIRED_FIELDS, ExpenseField.PERIOD, ExpenseField.PAYMENT_METHOD],
  [ExpenseDestination.CREDIT_CARD]: [...BASE_REQUIRED_FIELDS, ExpenseField.PAYMENT_METHOD],
  [ExpenseDestination.RECEIVABLE]: BASE_REQUIRED_FIELDS,
  [ExpenseDestination.DISCARD]: [],
}

// Short keys used in the prompt instead of database ids
export enum CatalogKind {
  PERSON = 'person',
  PAYMENT_METHOD = 'paymentMethod',
  CATEGORY = 'category',
}

export const CATALOG_REF_PREFIX: Record<CatalogKind, string> = {
  [CatalogKind.PERSON]: 'p',
  [CatalogKind.PAYMENT_METHOD]: 'pm',
  [CatalogKind.CATEGORY]: 'cat',
}
