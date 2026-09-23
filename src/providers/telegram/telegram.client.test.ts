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
})
