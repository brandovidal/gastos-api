import { Module } from '@nestjs/common'

import { ExpenseRecordDBModule } from '@/db/models/expense-record/expenseRecordDB.module'
import { StoredFilesModule } from '@/modules/stored-files/stored-files.module'

import { ExpensesController } from './expenses.controller'
import { ExpensesService } from './expenses.service'

@Module({
  imports: [ExpenseRecordDBModule, StoredFilesModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
