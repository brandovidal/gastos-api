import { randomUUID } from 'node:crypto'

import { Injectable } from '@nestjs/common'

import { ChannelMessageType } from '@/commons/constants/conversation.constant'
import { ExpenseDraftChannel, WEB_CHAT_ID } from '@/commons/constants/expense-draft.constant'
import { UnsupportedMessageException } from '@/commons/exceptions/messages/unsupported-message.exception'
import { decodeBotAction } from '@/modules/conversation/bot-action.codec'
import { ConversationService } from '@/modules/conversation/conversation.service'
import { ChannelMessage, ConversationResult } from '@/modules/conversation/dto/conversation.types'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'

import { MessageActionDto, SendMessageDto } from './dto/request/messages.dto'

export interface UploadedMessageFile {
  buffer: Buffer
  mimetype: string
  size: number
}

// "/resumen extra" -> "resumen"
const parseCommand = (text: string) => text.slice(1).split(/\s+/)[0].toLowerCase()

// Mensajes in kogane-app (D49, D57): the web is one more channel of the same ConversationService as Telegram.
// The web chat gets JSON: files made for the bot (Excel / PDF) are downloaded from Préstamos y deudas instead
// Edits of earlier Telegram messages (a split message closed on save) have no place in the web chat either
function withoutDocuments(result: ConversationResult): ConversationResult {
  return {
    ...result,
    replies: result.replies
      .filter((reply) => !reply.editMessageId)
      .map(({ document, trackShareOf: _trackShareOf, ...reply }) =>
        document ? { ...reply, text: `${reply.text}\nDescárgalo desde Préstamos y deudas.` } : reply,
      ),
  }
}

// Uploads go to R2 as temporary files (D58), so the AI, a retry from Borrador and the preview read them from there.
@Injectable()
export class MessagesService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly storedFilesService: StoredFilesService,
  ) {}

  async send(body: SendMessageDto, file?: UploadedMessageFile): Promise<ConversationResult> {
    const base = { channel: ExpenseDraftChannel.WEB, chatId: WEB_CHAT_ID, messageId: body.messageId }

    if (file)
      return withoutDocuments(await this.conversationService.handle({ ...base, ...(await this.toMedia(body, file)) }))

    const text = body.text?.trim()
    if (!text) throw new UnsupportedMessageException()

    const message: ChannelMessage = text.startsWith('/')
      ? { ...base, type: ChannelMessageType.COMMAND, command: parseCommand(text), text }
      : { ...base, type: ChannelMessageType.TEXT, text }
    return withoutDocuments(await this.conversationService.handle(message))
  }

  // A pressed button of a bot reply
  async action({ data }: MessageActionDto): Promise<ConversationResult> {
    const action = decodeBotAction(data)
    if (!action) throw new UnsupportedMessageException({ data })

    return withoutDocuments(
      await this.conversationService.handle({
        channel: ExpenseDraftChannel.WEB,
        chatId: WEB_CHAT_ID,
        messageId: `action:${randomUUID()}`,
        type: ChannelMessageType.ACTION,
        action,
      }),
    )
  }

  private async toMedia(body: SendMessageDto, file: UploadedMessageFile) {
    const isImage = file.mimetype.startsWith('image/')
    const isAudio = file.mimetype.startsWith('audio/')
    if (!isImage && !isAudio) throw new UnsupportedMessageException({ mimetype: file.mimetype })

    const storedFile = await this.storedFilesService.storeTemporary(ExpenseDraftChannel.WEB, file.buffer, file.mimetype)

    return {
      type: isImage ? ChannelMessageType.IMAGE : ChannelMessageType.AUDIO,
      ...(body.text?.trim() ? { text: body.text.trim() } : {}),
      media: {
        fileId: storedFile.id,
        // same bytes = same file: a screenshot uploaded twice is detected like a Telegram file_unique_id
        uniqueId: storedFile.sha256 as string,
        sizeBytes: file.size,
        durationSeconds: body.durationSeconds,
        storedFileId: storedFile.id,
      },
    }
  }
}
