import * as process from 'process'

export default () => ({
  app: {
    env: process.env.NODE_ENV ?? 'dev',
    port: Number(process.env.PORT ?? 5560),
  },
  auth: {
    apiKey: process.env.API_KEY,
  },
  db: {
    url: process.env.DATABASE_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
})
