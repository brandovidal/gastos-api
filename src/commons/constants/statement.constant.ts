// Bank statements (P14 block 2, D95)
export enum StatementSource {
  TEMPLATE = 'template', // read from the PDF text without AI
  AI = 'ai', // the extracted text (never the PDF or the document number) sent to the AI
}

export enum StatementStatus {
  REVIEW = 'review', // it has new rows or card expenses missing from it
  DONE = 'done',
}

export enum StatementRowResult {
  MATCHED = 'matched', // an expense already registered
  NEW = 'new', // only in the statement
  CREATED = 'created', // created from the statement
  IGNORED = 'ignored',
}

// A statement movement and a card expense are the same when the amount matches and the days are this close
export const STATEMENT_MATCH_DAYS = 3
// The rows of a template must add up to its total (± this or 1 %) or the text goes to the AI
export const STATEMENT_TOTAL_TOLERANCE = 1
export const MAX_STATEMENT_BYTES = 15 * 1024 * 1024
