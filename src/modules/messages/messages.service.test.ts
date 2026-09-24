import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { BotAction, ChannelMessageType } from '@/commons/constants/conversation.constant'
import { UnsupportedMessageException } from '@/commons/exceptions/messages/unsupported-message.exception'
import { ConversationService } from '@/modules/conversation/conversation.service'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'

import { MessagesService } from './messages.service'

const mockConversation = { handle: vi.fn() }
const mockStoredFiles = { storeTemporary: vi.fn() }

describe('MessagesService', () => {
  let service: MessagesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: ConversationService, useValue: mockConversation },
        { provide: StoredFilesService, useValue: mockStoredFiles },
      ],
    }).compile()
    service = module.get(MessagesService)
    mockConversation.handle.mockResolvedValue({ replies: [] })
  })

  afterEach(() => vi.clearAllMocks())

  it('should send a text of the web chat to the conversation as the channel web (D49)', async () => {
    await service.send({ messageId: 'm1', text: ' almuerzo 25 ' })

    expect(mockConversation.handle).toHaveBeenCalledWith({
      channel: 'web',
      chatId: 'web',
      messageId: 'm1',
      type: ChannelMessageType.TEXT,
      text: 'almuerzo 25',
    })
  })

  it('should read "/resumen" as a command', async () => {
    await service.send({ messageId: 'm2', text: '/Resumen octubre' })

    expect(mockConversation.handle).toHaveBeenCalledWith(
      expect.objectContaining({ type: ChannelMessageType.COMMAND, command: 'resumen', text: '/Resumen octubre' }),
    )
  })

  it('should keep an uploaded image in storage and send it as an image (D58)', async () => {
    mockStoredFiles.storeTemporary.mockResolvedValue({ id: 'stored-1', sha256: 'abc' })

    await service.send(
      { messageId: 'm3', text: 'persona dany' },
      { buffer: Buffer.from('img'), mimetype: 'image/png', size: 3 },
    )

    expect(mockStoredFiles.storeTemporary).toHaveBeenCalledWith('web', Buffer.from('img'), 'image/png')
    expect(mockConversation.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ChannelMessageType.IMAGE,
        text: 'persona dany',
        media: expect.objectContaining({ fileId: 'stored-1', uniqueId: 'abc', storedFileId: 'stored-1' }),
      }),
    )
  })

  it('should reject what it cannot read', async () => {
    await expect(service.send({ messageId: 'm4', text: '  ' })).rejects.toBeInstanceOf(UnsupportedMessageException)
    await expect(
      service.send({ messageId: 'm5' }, { buffer: Buffer.from('x'), mimetype: 'application/pdf', size: 1 }),
    ).rejects.toBeInstanceOf(UnsupportedMessageException)
    await expect(service.action({ data: 'unknown:x' })).rejects.toBeInstanceOf(UnsupportedMessageException)
  })

  it('should run a pressed button and leave out Telegram files and message edits', async () => {
    mockConversation.handle.mockResolvedValue({
      replies: [
        {
          text: '📎 deudas.pdf',
          document: { filename: 'deudas.pdf', mimeType: 'application/pdf', data: Buffer.from('%PDF') },
        },
        { text: '✅ Reparto guardado', editMessageId: '901' },
        { text: '👥 Reparto', trackShareOf: 'draft-1' },
      ],
    })

    const result = await service.action({ data: `${BotAction.SAVE}:draft-1` })

    expect(mockConversation.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        type: ChannelMessageType.ACTION,
        action: { name: BotAction.SAVE, draftId: 'draft-1' },
      }),
    )
    expect(result.replies).toEqual([
      { text: '📎 deudas.pdf\nDescárgalo desde Préstamos y deudas.' },
      { text: '👥 Reparto' },
    ])
  })
})
