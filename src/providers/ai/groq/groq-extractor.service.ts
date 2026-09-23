import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI from 'openai'

import { AiInputPartType, AiProvider, GROQ_BASE_URL } from '@/commons/constants/ai.constant'
import { AiInputNotSupportedException } from '@/commons/exceptions/ai/ai-input-not-supported.exception'
import { AiRequestFailedException } from '@/commons/exceptions/ai/ai-request-failed.exception'
import { GroqConfig } from '@/settings/settings.model'

import { AiExtractorProvider, GenerateJsonRequest, GenerateJsonResponse } from '../dto/ai-extractor.dto'

// Groq exposes an OpenAI-compatible API; it is the text-only fallback (Qwen)
@Injectable()
export class GroqExtractorService implements AiExtractorProvider {
  readonly provider = AiProvider.GROQ
  readonly supportsImages = false

  private client?: OpenAI

  constructor(private readonly configService: ConfigService) {}

  async generateJson({
    model,
    instructions,
    parts,
    jsonSchema,
    timeoutMs,
  }: GenerateJsonRequest): Promise<GenerateJsonResponse> {
    if (parts.some((part) => part.type !== AiInputPartType.TEXT)) {
      throw new AiInputNotSupportedException({ provider: this.provider, model })
    }

    const text = parts.map((part) => (part.type === AiInputPartType.TEXT ? part.text : '')).join('\n\n')

    // json_object mode does not enforce a schema, so the schema goes in the instructions
    const completion = await this.getClient().chat.completions.create(
      {
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${instructions}\n\nRespond only with a JSON object that matches this JSON Schema:\n${JSON.stringify(jsonSchema)}`,
          },
          { role: 'user', content: text },
        ],
      },
      { timeout: timeoutMs },
    )

    const content = completion.choices[0]?.message?.content

    if (!content) {
      throw new AiRequestFailedException({ provider: this.provider, model, reason: 'empty response' })
    }

    return {
      text: content,
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens,
    }
  }

  // Created on first use so the app starts without an API key
  private getClient(): OpenAI {
    if (!this.client) {
      const groq = this.configService.get<GroqConfig>('groq')

      if (!groq?.apiKey) {
        throw new AiRequestFailedException({ provider: this.provider, reason: 'GROQ_API_KEY is not set' })
      }

      this.client = new OpenAI({ apiKey: groq.apiKey, baseURL: GROQ_BASE_URL, maxRetries: 0 })
    }

    return this.client
  }
}
