import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import OpenAI, { toFile } from 'openai'

import { AiProvider, GROQ_BASE_URL, TRANSCRIPTION_LANGUAGE } from '@/commons/constants/ai.constant'
import { AiRequestFailedException } from '@/commons/exceptions/ai/ai-request-failed.exception'
import { GroqConfig } from '@/settings/settings.model'

export interface TranscribeRequest {
  model: string
  mimeType: string
  data: string // base64
  timeoutMs: number
}

// Whisper on Groq (OpenAI-compatible audio API): voice notes become text, then follow the text flow (P5)
@Injectable()
export class GroqTranscriberService {
  readonly provider = AiProvider.GROQ

  private client?: OpenAI

  constructor(private readonly configService: ConfigService) {}

  async transcribe({ model, mimeType, data, timeoutMs }: TranscribeRequest): Promise<string> {
    // Whisper picks the decoder by file name: Telegram voice notes are OGG/Opus
    const extension = mimeType.split('/')[1]?.replace('mpeg', 'mp3') ?? 'ogg'
    const file = await toFile(Buffer.from(data, 'base64'), `voice.${extension}`, { type: mimeType })

    const transcription = await this.getClient().audio.transcriptions.create(
      { file, model, language: TRANSCRIPTION_LANGUAGE, temperature: 0 },
      { timeout: timeoutMs },
    )

    return transcription.text.trim()
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
