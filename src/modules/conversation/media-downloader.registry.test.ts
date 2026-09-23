import { ExpenseDraftChannel } from '@/commons/constants/expense-draft.constant'

import { MediaDownloaderRegistry } from './media-downloader.registry'

describe('MediaDownloaderRegistry', () => {
  it('should download through the downloader of the channel', async () => {
    const registry = new MediaDownloaderRegistry()
    registry.register(ExpenseDraftChannel.TELEGRAM, async (fileId) => ({
      mimeType: 'image/jpeg',
      data: `data-${fileId}`,
    }))

    await expect(registry.download(ExpenseDraftChannel.TELEGRAM, 'f1')).resolves.toEqual({
      mimeType: 'image/jpeg',
      data: 'data-f1',
    })
  })

  it('should fail for a channel without downloader', () => {
    expect(() => new MediaDownloaderRegistry().download(ExpenseDraftChannel.TELEGRAM, 'f1')).toThrow(
      'No media downloader',
    )
  })
})
