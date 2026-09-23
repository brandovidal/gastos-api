import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { vi } from 'vitest'

import { TelegramClient } from '@/providers/telegram/telegram.client'
import { ConversationService } from '@/modules/conversation/conversation.service'
import { FILE_ID } from '@/modules/conversation/mocks/conversation.mock'

import { TelegramService } from './telegram.service'

const mockClient = {
  sendMessage: vi.fn().mockResolvedValue({}),
  editMessageText: vi.fn().mockResolvedValue({}),
  answerCallbackQuery: vi.fn().mockResolvedValue(true),
  sendChatAction: vi.fn().mockResolvedValue(true),
}
const mockConversation = { handle: vi.fn() }

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
})
