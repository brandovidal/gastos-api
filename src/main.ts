import { Logger } from '@nestjs/common'
import { App } from './app'

import { json, urlencoded } from 'express'

async function bootstrap() {
  const app = await App()

  const logger = new Logger('Bootstrap')

  const port = process.env.PORT ?? 5560

  app.use(json({ limit: '25mb' }))
  app.use(urlencoded({ limit: '25mb', extended: true }))

  await app.listen(port)

  logger.log(`Server is running on port http://localhost:${port}`)
}
bootstrap()
