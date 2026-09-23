import { AiInputPartType, AiProvider } from '@/commons/constants/ai.constant'

export type AiInputPart =
  { type: AiInputPartType.TEXT; text: string } | { type: AiInputPartType.IMAGE; mimeType: string; data: string } // data in base64

export interface GenerateJsonRequest {
  model: string
  instructions: string
  parts: AiInputPart[]
  jsonSchema: Record<string, unknown>
  timeoutMs: number
}

export interface GenerateJsonResponse {
  text: string
  inputTokens?: number
  outputTokens?: number
}

// A provider returns raw JSON text; validating it against the schema is the caller's job
export interface AiExtractorProvider {
  readonly provider: AiProvider
  readonly supportsImages: boolean
  generateJson(request: GenerateJsonRequest): Promise<GenerateJsonResponse>
}
