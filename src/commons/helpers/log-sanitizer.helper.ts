import { LOGGER_REDACTED_KEYS, LOGGER_SANITIZE_OPTIONS } from '../constants/logger.constant'

type SanitizeOptions = typeof LOGGER_SANITIZE_OPTIONS

export class LogSanitizer {
  static sanitize(value: unknown, options: SanitizeOptions = LOGGER_SANITIZE_OPTIONS, depth = 0): unknown {
    if (value == null) {
      return value
    }

    if (typeof value === 'string') {
      return value.length > options.maxStringLength
        ? `${value.slice(0, options.maxStringLength)}… (+${value.length - options.maxStringLength} chars)`
        : value
    }

    if (typeof value !== 'object') {
      return value
    }

    if (Buffer.isBuffer(value)) {
      return `[Buffer ${value.length} bytes]`
    }

    if (depth >= options.maxDepth) {
      return '[Truncated: max depth]'
    }

    if (Array.isArray(value)) {
      const items = value.slice(0, options.maxArrayItems).map((item) => LogSanitizer.sanitize(item, options, depth + 1))

      if (value.length > options.maxArrayItems) {
        items.push(`… (+${value.length - options.maxArrayItems} more items)`)
      }

      return items
    }

    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = LOGGER_REDACTED_KEYS.includes(key.toLowerCase())
        ? '[REDACTED]'
        : LogSanitizer.sanitize(val, options, depth + 1)
    }

    return result
  }
}
