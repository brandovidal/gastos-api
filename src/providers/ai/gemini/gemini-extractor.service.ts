import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoogleGenAI, Part } from '@google/genai'

import { AiInputPartType, AiProvider } from '@/commons/constants/ai.constant'
import { AiRequestFailedException } from '@/commons/exceptions/ai/ai-request-failed.exception'
import { GeminiConfig } from '@/settings/settings.model'

import { AiExtractorProvider, AiInputPart, GenerateJsonRequest, GenerateJsonResponse } from '../dto/ai-extractor.dto'

@Injectable()
export class GeminiExtractorService implements AiExtractorProvider {
  readonly provider = AiProvider.GEMINI
  readonly supportsImages = true

  private client?: GoogleGenAI

  constructor(private readonly configService: ConfigService) {}

  async generateJson({
    model,
    instructions,
    parts,
    jsonSchema,
    timeoutMs,
  }: GenerateJsonRequest): Promise<GenerateJsonResponse> {
    const response = await this.getClient().models.generateContent({
      model,
      contents: [{ role: 'user', parts: parts.map((part) => this.toGeminiPart(part)) }],
      config: {
        systemInstruction: instructions,
        responseMimeType: 'application/json',
        responseJsonSchema: jsonSchema,
        temperature: 0,
        httpOptions: { timeout: timeoutMs },
      },
    })

    if (!response.text) {
      throw new AiRequestFailedException({ provider: this.provider, model, reason: 'empty response' })
    }

    return {
      text: response.text,
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    }
  }

  private toGeminiPart(part: AiInputPart): Part {
    return part.type === AiInputPartType.TEXT
      ? { text: part.text }
      : { inlineData: { mimeType: part.mimeType, data: part.data } }
  }

  // Created on first use so the app starts without an API key
  private getClient(): GoogleGenAI {
    if (!this.client) {
      const gemini = this.configService.get<GeminiConfig>('gemini')

      if (!gemini?.apiKey) {
        throw new AiRequestFailedException({ provider: this.provider, reason: 'GEMINI_API_KEY is not set' })
      }

      this.client = new GoogleGenAI({ apiKey: gemini.apiKey })
    }

    return this.client
  }
}
