import { ConfigService } from '@nestjs/config'
import { vi } from 'vitest'

import { AiInputPartType } from '@/commons/constants/ai.constant'
import { AiRequestFailedException } from '@/commons/exceptions/ai/ai-request-failed.exception'

import { GeminiExtractorService } from './gemini-extractor.service'

const { mockGenerateContent } = vi.hoisted(() => ({ mockGenerateContent: vi.fn() }))

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function () {
    return { models: { generateContent: mockGenerateContent } }
  }),
}))

const request = {
  model: 'gemini-lite',
  instructions: 'extract',
  parts: [
    { type: AiInputPartType.IMAGE as const, mimeType: 'image/png', data: 'abc' },
    { type: AiInputPartType.TEXT as const, text: 'almuerzo 25' },
  ],
  jsonSchema: { type: 'object' },
  timeoutMs: 1000,
}

describe('GeminiExtractorService', () => {
  const createService = (apiKey?: string) =>
    new GeminiExtractorService(new ConfigService({ gemini: { apiKey, modelLite: 'gemini-lite', model: 'gemini' } }))

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should request JSON output with the schema and map parts and usage', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '{"expenses":[]}',
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    })

    const response = await createService('key').generateJson(request)

    expect(response).toEqual({ text: '{"expenses":[]}', inputTokens: 10, outputTokens: 5 })
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-lite',
      contents: [
        { role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'abc' } }, { text: 'almuerzo 25' }] },
      ],
      config: {
        systemInstruction: 'extract',
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object' },
        temperature: 0,
        httpOptions: { timeout: 1000 },
      },
    })
  })

  it('should fail on an empty response', async () => {
    mockGenerateContent.mockResolvedValue({ text: undefined })

    await expect(createService('key').generateJson(request)).rejects.toThrow(AiRequestFailedException)
  })

  it('should fail without an API key and without calling Gemini', async () => {
    await expect(createService().generateJson(request)).rejects.toThrow(AiRequestFailedException)
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })
})
