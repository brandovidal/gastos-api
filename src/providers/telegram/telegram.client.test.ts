import { ConfigService } from '@nestjs/config'
import { vi } from 'vitest'

import { TelegramRequestFailedException } from '@/commons/exceptions/telegram/telegram-request-failed.exception'

import { TelegramClient } from './telegram.client'

const mockFetch = vi.fn()

describe('TelegramClient', () => {
  const client = (botToken?: string) =>
    new TelegramClient(new ConfigService({ telegram: { botToken, allowedChatIds: [] } }))

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('should send HTML messages with the inline keyboard', async () => {
    mockFetch.mockResolvedValue({ status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) })
    const markup = { inline_keyboard: [[{ text: 'ok', callback_data: 'ok:1' }]] }

    await expect(client('123:abc').sendMessage('555', '<b>hola</b>', markup)).resolves.toEqual({ message_id: 1 })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.telegram.org/bot123:abc/sendMessage')
    expect(JSON.parse(init.body)).toEqual({
      chat_id: '555',
      text: '<b>hola</b>',
      parse_mode: 'HTML',
      reply_markup: markup,
    })
  })

  it('should fail with the Telegram description and without leaking the token', async () => {
    mockFetch.mockResolvedValue({ status: 400, json: async () => ({ ok: false, description: 'Bad Request' }) })

    const error = await client('123:abc')
      .answerCallbackQuery('cb')
      .catch((caught: TelegramRequestFailedException) => caught)

    expect(error).toBeInstanceOf(TelegramRequestFailedException)
    expect(JSON.stringify((error as TelegramRequestFailedException).getResponse())).not.toContain('123:abc')
  })

  it('should fail without a bot token and without calling Telegram', async () => {
    await expect(client().sendChatAction('555', 'typing')).rejects.toThrow(TelegramRequestFailedException)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  describe('retries', () => {
    const ok = { status: 200, json: async () => ({ ok: true, result: true }) }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should wait retry_after on 429 and then succeed', async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 429,
          json: async () => ({ ok: false, description: 'Too Many Requests', parameters: { retry_after: 3 } }),
        })
        .mockResolvedValueOnce(ok)

      const pending = client('123:abc').sendMessage('555', 'hola')
      await vi.advanceTimersByTimeAsync(2_999)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)

      await expect(pending).resolves.toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should retry network errors and 5xx, and give up after 2 retries', async () => {
      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce({ status: 502, json: async () => ({ ok: false, description: 'Bad Gateway' }) })
        .mockResolvedValueOnce({ status: 502, json: async () => ({ ok: false, description: 'Bad Gateway' }) })

      const pending = client('123:abc')
        .sendMessage('555', 'hola')
        .catch((caught: unknown) => caught)
      await vi.runAllTimersAsync()

      expect(await pending).toBeInstanceOf(TelegramRequestFailedException)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('should not retry client errors or a flood wait longer than the limit', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 429,
        json: async () => ({ ok: false, parameters: { retry_after: 120 } }),
      })

      await expect(client('123:abc').sendMessage('555', 'hola')).rejects.toThrow(TelegramRequestFailedException)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  it('should read the webhook info', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, result: { url: 'https://x/v1/telegram/webhook', pending_update_count: 0 } }),
    })

    await expect(client('123:abc').getWebhookInfo()).resolves.toEqual({
      url: 'https://x/v1/telegram/webhook',
      pending_update_count: 0,
    })
  })
})
