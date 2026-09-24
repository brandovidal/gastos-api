import { Module } from '@nestjs/common'

import { AiRequestLogDBModule } from '@/db/models/ai-request-log/aiRequestLogDB.module'
import { ExpenseDBModule } from '@/db/models/expense/expenseDB.module'

import { OcrService } from './ocr.service'
import { RecognitionService } from './recognition.service'

@Module({
  imports: [AiRequestLogDBModule, ExpenseDBModule],
  providers: [OcrService, RecognitionService],
  exports: [RecognitionService],
})
export class RecognitionModule {}
