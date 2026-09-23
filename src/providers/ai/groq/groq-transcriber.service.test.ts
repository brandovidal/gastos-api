import { ConfigService } from '@nestjs/config'
import { vi } from 'vitest'

import { AiRequestFailedException } from '@/commons/exceptions/ai/ai-request-failed.exception'

import { GroqTranscriberService } from './groq-transcriber.service'

const mockCreate = vi.fn()

vi.mock('openai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('openai')>()
  return {
    ...actual,
    default: vi.fn().mockImplementation(function () {
      return { audio: { transcriptions: { create: mockCreate } } }
    }),
  }
})

describe('GroqTranscriberService', () => {
  const service = (apiKey?: string) => new GroqTranscriberService(new ConfigService({ groq: { apiKey } }))
  const request = {
    model: 'whisper-large-v3-turbo',
    mimeType: 'audio/ogg',
    data: Buffer.from('ogg').toString('base64'),
    timeoutMs: 20_000,
  }

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should send the voice note in Spanish and return the trimmed text', async () => {
    mockCreate.mockResolvedValue({ text: ' almuerzo 25 soles con yape ' })

    await expect(service('gsk').transcribe(request)).resolves.toBe('almuerzo 25 soles con yape')

    const [body, options] = mockCreate.mock.calls[0]
    expect(body).toMatchObject({ model: 'whisper-large-v3-turbo', language: 'es', temperature: 0 })
    expect(body.file.name).toBe('voice.ogg')
    expect(options).toEqual({ timeout: 20_000 })
  })

  it('should fail without an API key', async () => {
    await expect(service().transcribe(request)).rejects.toThrow(AiRequestFailedException)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
