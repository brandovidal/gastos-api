export const LOGGER_NAMESPACE = 'KOGANE-API'
export const LOGGER_TRANSPORT_OPTION_IGNORE = 'pid,hostname,err'

export const LOG_CONTEXT_KEY = Symbol('logContext')

export const LOGGER_SANITIZE_OPTIONS = {
  maxArrayItems: 5,
  maxStringLength: 500,
  maxDepth: 6,
}

export const LOGGER_REDACTED_KEYS = [
  'password',
  'authorization',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
]
