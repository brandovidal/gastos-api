import { ExecutionContext } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { ApiKeyGuard } from './api-key.guard'
import { ApiKeyRequiredException } from '../exceptions/auth/api-key-required.exception'
import { InvalidApiKeyException } from '../exceptions/auth/invalid-api-key.exception'

const mockConfigService = {
  get: vi.fn(),
}

const createContext = (headers: Record<string, string>) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  }) as unknown as ExecutionContext

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiKeyGuard, { provide: ConfigService, useValue: mockConfigService }],
    }).compile()

    guard = module.get<ApiKeyGuard>(ApiKeyGuard)
    mockConfigService.get.mockReturnValue({ apiKey: 'secret' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should allow a request with a valid api key', () => {
    expect(guard.canActivate(createContext({ 'x-api-key': 'secret' }))).toBe(true)
  })

  it('should throw ApiKeyRequiredException when the header is missing', () => {
    expect(() => guard.canActivate(createContext({}))).toThrow(ApiKeyRequiredException)
  })

  it('should throw InvalidApiKeyException when the api key does not match', () => {
    expect(() => guard.canActivate(createContext({ 'x-api-key': 'wrong' }))).toThrow(InvalidApiKeyException)
  })

  it('should throw InvalidApiKeyException when no api key is configured', () => {
    mockConfigService.get.mockReturnValue(undefined)

    expect(() => guard.canActivate(createContext({ 'x-api-key': 'secret' }))).toThrow(InvalidApiKeyException)
  })
})
