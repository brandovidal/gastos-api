import { ConfigService } from '@nestjs/config'
import { vi } from 'vitest'

import { AiInputPartType, GROQ_BASE_URL } from '@/commons/constants/ai.constant'
import { AiInputNotSupportedException } from '@/commons/exceptions/ai/ai-input-not-supported.exception'
import { AiRequestFailedException } from '@/commons/exceptions/ai/ai-request-failed.exception'

import { GroqExtractorService } from './groq-extractor.service'

const { mockCreate, mockOpenAI } = vi.hoisted(() => {
  const mockCreate = vi.fn()
  return {
    mockCreate,
    mockOpenAI: vi.fn(function () {
      return { chat: { completions: { create: mockCreate } } }
    }),
  }
})

vi.mock('openai', () => ({ default: mockOpenAI }))

const textRequest = {
  model: 'qwen',
  instructions: 'extract',
  parts: [{ type: AiInputPartType.TEXT as const, text: 'almuerzo 25' }],
  jsonSchema: { type: 'object' },
  timeoutMs: 1000,
}

describe('GroqExtractorService', () => {
  const createService = (apiKey?: string) =>
    new GroqExtractorService(new ConfigService({ groq: { apiKey, model: 'qwen' } }))

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should call the OpenAI-compatible API in JSON mode with the schema in the instructions', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"expenses":[]}' } }],
      usage: { prompt_tokens: 20, completion_tokens: 4 },
    })

    const response = await createService('key').generateJson(textRequest)

    expect(response).toEqual({ text: '{"expenses":[]}', inputTokens: 20, outputTokens: 4 })
    expect(mockOpenAI).toHaveBeenCalledWith({ apiKey: 'key', baseURL: GROQ_BASE_URL, maxRetries: 0 })

    const [body, options] = mockCreate.mock.calls[0]
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[0].content).toContain('{"type":"object"}')
    expect(body.messages[1]).toEqual({ role: 'user', content: 'almuerzo 25' })
    expect(options).toEqual({ timeout: 1000 })
  })

  it('should reject images because the fallback is text-only', async () => {
    const imageRequest = {
      ...textRequest,
      parts: [{ type: AiInputPartType.IMAGE as const, mimeType: 'image/png', data: 'abc' }],
    }

    await expect(createService('key').generateJson(imageRequest)).rejects.toThrow(AiInputNotSupportedException)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('should fail on an empty response', async () => {
    mockCreate.mockResolvedValue({ choices: [] })

    await expect(createService('key').generateJson(textRequest)).rejects.toThrow(AiRequestFailedException)
  })

  it('should fail without an API key', async () => {
    await expect(createService().generateJson(textRequest)).rejects.toThrow(AiRequestFailedException)
  })
})
