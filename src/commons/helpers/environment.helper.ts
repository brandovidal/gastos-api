export const PRODUCTION_ENV = 'production'

// Swagger (/docs) is only served outside production
export const isDocsEnabled = (nodeEnv: string | undefined): boolean => nodeEnv !== PRODUCTION_ENV
