import { Module } from '@nestjs/common'

import { AiExtractorProviderStrategy } from './ai-extractor-provider.strategy'
import { GeminiExtractorService } from './gemini/gemini-extractor.service'
import { GroqExtractorService } from './groq/groq-extractor.service'

@Module({
  providers: [GeminiExtractorService, GroqExtractorService, AiExtractorProviderStrategy],
  exports: [AiExtractorProviderStrategy],
})
export class AiModule {}
