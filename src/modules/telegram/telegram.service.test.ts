import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { vi } from 'vitest'

import { TelegramClient } from '@/providers/telegram/telegram.client'
import { ConversationService } from '@/modules/conversation/conversation.service'
import { FILE_ID } from '@/modules/conversation/mocks/conversation.mock'

import { MediaDownloaderRegistry } from '@/modules/conversation/media-downloader.registry'

import { TELEGRAM_UPDATES } from './mocks/telegram-updates.mock'
import { TelegramService } from './telegram.service'

const mockClient = {
  sendMessage: vi.fn().mockResolvedValue({}),
  editMessageText: vi.fn().mockResolvedValue({}),
  answerCallbackQuery: vi.fn().mockResolvedValue(true),
  sendChatAction: vi.fn().mockResolvedValue(true),
  downloadFile: vi.fn(),
}
const mockConversation = { handle: vi.fn(), recoverInterrupted: vi.fn() }
const mockRegistry = { register: vi.fn() }

const chat = { id: 555, type: 'private' }
const textUpdate = { update_id: 1, message: { message_id: 10, chat, date: 0, text: 'almuerzo 25' } }
const buttonUpdate = {
  update_id: 2,
  callback_query: { id: 'cb-1', data: `ok:${FILE_ID}`, message: { message_id: 20, chat, date: 0 } },
}

describe('TelegramService', () => {
  const service = new TelegramService(
    new ConfigService({ telegram: { allowedChatIds: ['555'] } }),
    mockClient as unknown as TelegramClient,
    mockConversation as unknown as ConversationService,
    mockRegistry as unknown as MediaDownloaderRegistry,
  )

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should show "typing", run the conversation and send the replies with their keyboard', async () => {
    mockConversation.handle.mockResolvedValue({
      replies: [{ text: 'resumen', buttons: [[{ label: '✅ Guardar', data: `ok:${FILE_ID}` }]] }],
    })

    await service.enqueue(textUpdate)

    expect(mockClient.sendChatAction).toHaveBeenCalledWith('555', 'typing')
    expect(mockClient.sendMessage).toHaveBeenCalledWith('555', 'resumen', {
      inline_keyboard: [[{ text: '✅ Guardar', callback_data: `ok:${FILE_ID}` }]],
    })
  })

  it('should answer the button and edit the message that had it', async () => {
    mockConversation.handle.mockResolvedValue({ replies: [{ text: '✅ Guardado', edit: true }], notice: 'Guardado' })

    await service.enqueue(buttonUpdate)

    expect(mockClient.answerCallbackQuery).toHaveBeenCalledWith('cb-1', 'Guardado')
    expect(mockClient.editMessageText).toHaveBeenCalledWith('555', 20, '✅ Guardado', undefined)
    expect(mockClient.sendMessage).not.toHaveBeenCalled()
  })

  it('should ignore chats outside the allowlist and updates it does not understand', () => {
    expect(
      service.enqueue({ ...textUpdate, message: { ...textUpdate.message, chat: { id: 999, type: 'private' } } }),
    ).toBeNull()
    expect(service.enqueue({ update_id: 3 })).toBeNull()
    expect(mockConversation.handle).not.toHaveBeenCalled()
  })

  it('should tell the user when something fails and still release the button', async () => {
    mockConversation.handle.mockRejectedValue(new Error('db down'))

    await service.enqueue(buttonUpdate)

    expect(mockClient.answerCallbackQuery).toHaveBeenCalledWith('cb-1')
    expect(mockClient.sendMessage).toHaveBeenCalledWith('555', expect.stringContaining('Algo salió mal'))
  })

  it('should send the reply as a new message when the old one cannot be edited', async () => {
    mockConversation.handle.mockResolvedValue({ replies: [{ text: '✅ Guardado', edit: true }], notice: 'Guardado' })
    mockClient.editMessageText.mockRejectedValueOnce(new Error('message to edit not found'))

    await service.enqueue(buttonUpdate)

    expect(mockClient.sendMessage).toHaveBeenCalledWith('555', '✅ Guardado', undefined)
    expect(mockClient.sendMessage).not.toHaveBeenCalledWith('555', expect.stringContaining('Algo salió mal'))
  })

  describe('lifecycle', () => {
    it('should move interrupted drafts to /borrador on startup and tell only allowed chats', async () => {
      mockConversation.recoverInterrupted.mockResolvedValue([
        { chatId: '555', count: 2 },
        { chatId: '999', count: 1 },
      ])

      service.onApplicationBootstrap()
      await vi.waitFor(() => expect(mockClient.sendMessage).toHaveBeenCalled())

      const [, before] = mockConversation.recoverInterrupted.mock.calls[0]
      expect(Date.now() - (before as Date).getTime()).toBeGreaterThanOrEqual(2 * 60_000 - 1000)
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(1)
      expect(mockClient.sendMessage).toHaveBeenCalledWith('555', expect.stringContaining('2 mensajes'), {
        inline_keyboard: [[{ text: '📝 Borrador', callback_data: 'cmd:borrador' }]],
      })
    })

    it('should not break startup when the recovery fails', async () => {
      mockConversation.recoverInterrupted.mockRejectedValue(new Error('db down'))

      expect(() => service.onApplicationBootstrap()).not.toThrow()
      await vi.waitFor(() => expect(Logger.prototype.error).toHaveBeenCalled())
    })

    it('should wait for the messages in process before shutting down', async () => {
      let finish: () => void = () => {}
      mockConversation.handle.mockReturnValue(
        new Promise((resolve) => {
          finish = () => resolve({ replies: [] })
        }),
      )
      void service.enqueue(textUpdate)

      let shutDown = false
      const shutdown = service.beforeApplicationShutdown().then(() => (shutDown = true))
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(shutDown).toBe(false)

      finish()
      await shutdown
      expect(shutDown).toBe(true)
    })
  })

  it('should register a downloader that returns the image in base64 with its type', async () => {
    service.onModuleInit()
    const [channel, downloader] = mockRegistry.register.mock.calls[0]
    mockClient.downloadFile.mockResolvedValue({ data: Buffer.from('png-bytes'), filePath: 'documents/file_3.PNG' })

    expect(channel).toBe('telegram')
    await expect(downloader('file-1')).resolves.toEqual({
      mimeType: 'image/png',
      data: Buffer.from('png-bytes').toString('base64'),
    })
  })

  it('should download voice notes as audio/ogg', async () => {
    service.onModuleInit()
    const [, downloader] = mockRegistry.register.mock.calls[0]
    mockClient.downloadFile.mockResolvedValue({ data: Buffer.from('ogg'), filePath: 'voice/file_7.oga' })

    await expect(downloader('file-7')).resolves.toMatchObject({ mimeType: 'audio/ogg' })
  })

  it('should wait for every photo of an album and handle them as one message (P21)', async () => {
    vi.useFakeTimers()
    try {
      mockConversation.handle.mockResolvedValue({ replies: [{ text: '📋 2 gastos' }] })
      const [first, second] = TELEGRAM_UPDATES.album

      const done = service.enqueue(second)
      service.enqueue(first)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(mockConversation.handle).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1_500)
      await done

      expect(mockConversation.handle).toHaveBeenCalledTimes(1)
      expect(mockConversation.handle.mock.calls[0][0]).toMatchObject({
        messageId: '15',
        album: [
          { messageId: '14', media: { uniqueId: 'AQADalbum1-x' } },
          { messageId: '15', media: { uniqueId: 'AQADalbum2-x' } },
        ],
      })
      expect(mockClient.sendMessage).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('should not lose an album that is still waiting when the app shuts down', async () => {
    vi.useFakeTimers()
    try {
      mockConversation.handle.mockResolvedValue({ replies: [] })
      service.enqueue(TELEGRAM_UPDATES.album[0])

      await service.beforeApplicationShutdown()

      expect(mockConversation.handle).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('should show "typing" while an image is read', async () => {
    mockConversation.handle.mockResolvedValue({ replies: [] })

    await service.enqueue(TELEGRAM_UPDATES.photo)

    expect(mockClient.sendChatAction).toHaveBeenCalledWith('555', 'typing')
  })
})
