import { Injectable } from '@nestjs/common'

import { AiProvider } from '@/commons/constants/ai.constant'

import { AiExtractorProvider } from './dto/ai-extractor.dto'
import { GeminiExtractorService } from './gemini/gemini-extractor.service'
import { GroqExtractorService } from './groq/groq-extractor.service'

// Same idea as mms-ai AiAgentProviderStrategy: one Map from provider type to implementation
@Injectable()
export class AiExtractorProviderStrategy {
  private readonly providers: Map<AiProvider, AiExtractorProvider>

  constructor(
    private readonly geminiExtractorService: GeminiExtractorService,
    private readonly groqExtractorService: GroqExtractorService,
  ) {
    this.providers = new Map<AiProvider, AiExtractorProvider>([
      [AiProvider.GEMINI, this.geminiExtractorService],
      [AiProvider.GROQ, this.groqExtractorService],
    ])
  }

  getProvider(type: AiProvider): AiExtractorProvider {
    const provider = this.providers.get(type)

    if (!provider) {
      throw new Error(`Provider type ${type} not supported`)
    }

    return provider
  }
}
