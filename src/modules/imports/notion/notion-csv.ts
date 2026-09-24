// CSV exported from Notion ("Exportar ▸ CSV"): RFC 4180 quoting, a BOM at the start, CRLF or LF line ends.
// Returns one object per row keyed by the header names (trimmed).

export interface CsvRow {
  line: number // 1-based line in the file of the row (the header is line 1)
  values: Record<string, string>
}

function parseRecords(text: string): string[][] {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let quoted = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      record.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else field += char
  }
  if (field || record.length) {
    record.push(field)
    records.push(record)
  }
  return records
}

export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const records = parseRecords(text.replace(/^\uFEFF/, ''))
  const [headerRecord = [], ...body] = records
  const headers = headerRecord.map((header) => header.trim())
  const rows = body
    .map((record, index) => ({
      line: index + 2,
      values: Object.fromEntries(headers.map((header, column) => [header, (record[column] ?? '').trim()])),
    }))
    .filter((row) => Object.values(row.values).some(Boolean))
  return { headers, rows }
}
