import { createHash, randomUUID } from 'node:crypto'

import { Inject, Injectable, OnModuleInit } from '@nestjs/common'

import { ChannelMessageType } from '@/commons/constants/conversation.constant'
import { ExpenseDraftChannel, WEB_CHAT_ID } from '@/commons/constants/expense-draft.constant'
import { UnsupportedMessageException } from '@/commons/exceptions/messages/unsupported-message.exception'
import { decodeBotAction } from '@/modules/conversation/bot-action.codec'
import { ConversationService } from '@/modules/conversation/conversation.service'
import { ChannelMessage, ConversationResult } from '@/modules/conversation/dto/conversation.types'
import { MediaDownloaderRegistry } from '@/modules/conversation/media-downloader.registry'
import { OBJECT_STORAGE } from '@/providers/storage/storage.module'
import { ObjectStorage } from '@/providers/storage/storage.types'

import { MessageActionDto, SendMessageDto } from './dto/request/messages.dto'

export interface UploadedMessageFile {
  buffer: Buffer
  mimetype: string
  size: number
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
}

// "/resumen extra" -> "resumen"
const parseCommand = (text: string) => text.slice(1).split(/\s+/)[0].toLowerCase()

// Mensajes in kogane-app (D49, D57): the web is one more channel of the same ConversationService as Telegram.
// Uploads are kept in R2 (D54) so a failed image or voice note can be read again from Borrador.
@Injectable()
export class MessagesService implements OnModuleInit {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly mediaDownloaderRegistry: MediaDownloaderRegistry,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  // For web messages the media "file id" is the storage key
  onModuleInit() {
    this.mediaDownloaderRegistry.register(ExpenseDraftChannel.WEB, async (storageKey) => {
      const { data, contentType } = await this.storage.get(storageKey)
      return { mimeType: contentType, data: data.toString('base64') }
    })
  }

  async send(body: SendMessageDto, file?: UploadedMessageFile): Promise<ConversationResult> {
    const base = { channel: ExpenseDraftChannel.WEB, chatId: WEB_CHAT_ID, messageId: body.messageId }

    if (file) return this.conversationService.handle({ ...base, ...(await this.toMedia(body, file)) })

    const text = body.text?.trim()
    if (!text) throw new UnsupportedMessageException()

    const message: ChannelMessage = text.startsWith('/')
      ? { ...base, type: ChannelMessageType.COMMAND, command: parseCommand(text) }
      : { ...base, type: ChannelMessageType.TEXT, text }
    return this.conversationService.handle(message)
  }

  // A pressed button of a bot reply
  async action({ data }: MessageActionDto): Promise<ConversationResult> {
    const action = decodeBotAction(data)
    if (!action) throw new UnsupportedMessageException({ data })

    return this.conversationService.handle({
      channel: ExpenseDraftChannel.WEB,
      chatId: WEB_CHAT_ID,
      messageId: `action:${randomUUID()}`,
      type: ChannelMessageType.ACTION,
      action,
    })
  }

  private async toMedia(body: SendMessageDto, file: UploadedMessageFile) {
    const isImage = file.mimetype.startsWith('image/')
    const isAudio = file.mimetype.startsWith('audio/')
    if (!isImage && !isAudio) throw new UnsupportedMessageException({ mimetype: file.mimetype })

    const mimeType = file.mimetype.split(';')[0]
    const storageKey = `web/${new Date().toISOString().slice(0, 7)}/${body.messageId}${EXTENSION_BY_MIME[mimeType] ?? ''}`
    await this.storage.put(storageKey, file.buffer, mimeType)

    return {
      type: isImage ? ChannelMessageType.IMAGE : ChannelMessageType.AUDIO,
      ...(body.text?.trim() ? { text: body.text.trim() } : {}),
      media: {
        fileId: storageKey,
        // same bytes = same file: a screenshot uploaded twice is detected like a Telegram file_unique_id
        uniqueId: createHash('sha256').update(file.buffer).digest('hex'),
        sizeBytes: file.size,
        durationSeconds: body.durationSeconds,
        storageKey,
      },
    }
  }
}
