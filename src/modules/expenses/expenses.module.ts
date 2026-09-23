import { Module } from '@nestjs/common'

import { ExpenseRecordDBModule } from '@/db/models/expense-record/expenseRecordDB.module'
import { ExpenseExtractionModule } from '@/modules/expense-extraction/expense-extraction.module'
import { StoredFilesModule } from '@/modules/stored-files/stored-files.module'

import { ExpensesController } from './expenses.controller'
import { ExpensesService } from './expenses.service'

@Module({
  imports: [ExpenseRecordDBModule, ExpenseExtractionModule, StoredFilesModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
