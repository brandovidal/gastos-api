// Splits a migration.sql into statements for db-deploy: Prisma's SQLite files end each statement with ";" at the end
// of a line, and a CREATE TRIGGER holds several inside BEGIN … END (P29), so it only ends at the line "END;"
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current: string[] = []
  let inTrigger = false

  for (const line of sql.split('\n')) {
    if (/^\s*--/.test(line)) continue
    current.push(line)
    if (!inTrigger && /^\s*CREATE\s+(TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i.test(current.join('\n').trimStart())) {
      inTrigger = true
    }
    const ended = inTrigger ? /^\s*END\s*;\s*$/i.test(line) : /;\s*$/.test(line)
    if (ended) {
      statements.push(current.join('\n').trim().replace(/;$/, ''))
      current = []
      inTrigger = false
    }
  }
  const rest = current.join('\n').trim()
  if (rest) statements.push(rest)
  return statements.filter(Boolean)
}
