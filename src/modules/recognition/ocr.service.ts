import { mkdir } from 'node:fs/promises'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createWorker, PSM } from 'tesseract.js'

import { MediaFile } from '@/modules/expense-extraction/dto/expense-extraction.types'
import { OcrConfig } from '@/settings/settings.model'

// tesseract.js in Spanish (P21). One worker per screenshot: a few screenshots a day do not justify keeping ~100 MB of
// OCR in memory. The model is downloaded once to OCR_CACHE_DIR.
@Injectable()
export class OcrService {
  private readonly config: OcrConfig

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<OcrConfig>('ocr')
  }

  get enabled() {
    return this.config.enabled
  }

  async read(image: MediaFile): Promise<string> {
    await mkdir(this.config.cacheDir, { recursive: true })
    const worker = await createWorker('spa', 1, { cachePath: this.config.cacheDir })
    try {
      // Screenshots have scattered text in several sizes: the default single-block mode skips big amounts
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
      const { data } = await worker.recognize(Buffer.from(image.data, 'base64'))
      return data.text
    } finally {
      await worker.terminate()
    }
  }
}
