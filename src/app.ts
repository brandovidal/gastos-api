import { NestFactory, Reflector } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

import { cleanupOpenApiDoc, ZodValidationPipe } from 'nestjs-zod'
import { Logger } from 'nestjs-pino'

import { AppModule } from './app.module'

import { ResponseInterceptor } from './commons/serializers/response.serializer'
import { DOCUMENT_TITLE, DOCUMENT_DESCRIPTION, DOCUMENT_VERSION } from './commons/constants/documentation.constant'
import { API_KEY_HEADER } from './commons/constants/auth.constant'
import { VERSIONING_OPTIONS } from './commons/constants/versioning.constant'
import { isDocsEnabled } from './commons/helpers/environment.helper'

export async function App() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })

  app.useLogger(app.get(Logger))

  app.enableVersioning(VERSIONING_OPTIONS)

  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)))

  app.useGlobalPipes(new ZodValidationPipe())

  app.enableShutdownHooks()

  // Swagger stays off in production so the API map is not public (D53)
  if (isDocsEnabled(process.env.NODE_ENV)) {
    const config = new DocumentBuilder()
      .setTitle(DOCUMENT_TITLE)
      .setDescription(DOCUMENT_DESCRIPTION)
      .setVersion(DOCUMENT_VERSION)
      .addApiKey({ type: 'apiKey', name: API_KEY_HEADER, in: 'header' }, API_KEY_HEADER)
      .build()
    const document = SwaggerModule.createDocument(app, config)
    SwaggerModule.setup('docs', app, cleanupOpenApiDoc(document))
  }

  return app
}
