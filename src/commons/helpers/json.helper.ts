// JSON columns are stored as strings in SQLite/libSQL. Parsing never throws: a corrupt
// value falls back to the empty default so one bad row cannot break the bot.
export class JsonHelper {
  static parseArray<T = string>(value: string | null | undefined): T[] {
    const parsed = JsonHelper.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  }

  static parseObject<T extends object = Record<string, unknown>>(value: string | null | undefined): T {
    const parsed = JsonHelper.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : ({} as T)
  }

  static stringify(value: unknown): string {
    return JSON.stringify(value ?? null)
  }

  private static parse(value: string | null | undefined): unknown {
    if (!value) return null

    try {
      return JSON.parse(value)
    } catch (_error) {
      return null
    }
  }
}
