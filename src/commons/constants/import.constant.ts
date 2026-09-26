// Notion imports (P14, D90, D104)

export enum ImportBatchStatus {
  PREVIEW = 'preview', // saved to review: nothing written in the expenses yet
  APPLIED = 'applied',
}

export enum ImportRowKind {
  EXPENSE = 'expense', // card expense, fixed cost, platform or debt
  GROUP = 'group', // % of a budget group
  BUDGET = 'budget', // salary of a month
  ISSUE = 'issue', // a row or file that is not imported
}

export enum ImportRowStatus {
  NEW = 'new',
  CHANGED = 'changed', // the Notion row is not the one of the last applied import
  UNCHANGED = 'unchanged', // same row: not touched, so edits made in Kogane stay
  BLOCKED = 'blocked',
  WARNING = 'warning',
}

// Tabs of the preview: where each row goes
export enum ImportTab {
  CARDS = 'cards',
  FIXED_COSTS = 'fixed_costs',
  PLATFORMS = 'platforms',
  DEBTS = 'debts',
  BUDGET = 'budget',
  ISSUES = 'issues',
}

export const MAX_IMPORT_BYTES = 30 * 1024 * 1024 // the Notion ZIP with its Markdown pages
export const IMPORT_PAGE_SIZE = 50
