import { Injectable } from '@nestjs/common'

import { ExpenseDraftChannel } from '@/commons/constants/expense-draft.constant'
import { MediaFile } from '@/modules/expense-extraction/dto/expense-extraction.types'

// Downloads a file of a channel by its id, in memory (the file is never stored)
export type MediaDownloader = (fileId: string) => Promise<MediaFile>

// Each channel registers how to download its files, so the conversation stays channel-agnostic
// and a failed image can be downloaded again from /bandeja
@Injectable()
export class MediaDownloaderRegistry {
  private readonly downloaders = new Map<ExpenseDraftChannel, MediaDownloader>()

  register(channel: ExpenseDraftChannel, downloader: MediaDownloader) {
    this.downloaders.set(channel, downloader)
  }

  download(channel: ExpenseDraftChannel, fileId: string): Promise<MediaFile> {
    const downloader = this.downloaders.get(channel)
    if (!downloader) throw new Error(`No media downloader for channel ${channel}`)
    return downloader(fileId)
  }
}
