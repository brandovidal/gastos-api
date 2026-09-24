// Budget per category (P19): where the spending of a category stands against its limit
export enum BudgetStatus {
  OK = 'ok',
  WARNING = 'warning', // at or above the alert threshold (80 % by default)
  OVER = 'over', // at or above 100 %
}

export const DEFAULT_ALERT_THRESHOLD = 80

// GET /v1/summary/history: months of surplus shown by default and at most
export const DEFAULT_HISTORY_MONTHS = 6
export const MAX_HISTORY_MONTHS = 24
