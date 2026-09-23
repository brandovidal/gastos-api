import { Module } from '@nestjs/common'

import { AiExtractorProviderStrategy } from './ai-extractor-provider.strategy'
import { GeminiExtractorService } from './gemini/gemini-extractor.service'
import { GroqExtractorService } from './groq/groq-extractor.service'
import { GroqTranscriberService } from './groq/groq-transcriber.service'

@Module({
  providers: [GeminiExtractorService, GroqExtractorService, GroqTranscriberService, AiExtractorProviderStrategy],
  exports: [AiExtractorProviderStrategy, GroqTranscriberService],
})
export class AiModule {}
