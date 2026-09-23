export interface AppConfig {
  env: string
  port: number
}

export interface AuthConfig {
  apiKey?: string
}

export interface DatabaseConfig {
  url: string
  authToken?: string
}
