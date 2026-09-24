import { Module } from '@nestjs/common'

import { ExpenseRecordDBModule } from '@/db/models/expense-record/expenseRecordDB.module'
import { RecurringExpenseDBModule } from '@/db/models/recurring-expense/recurringExpenseDB.module'
import { StoredFilesModule } from '@/modules/stored-files/stored-files.module'

import { ExpensesController } from './expenses.controller'
import { ExpensesService } from './expenses.service'
import { RecurringExpensesController } from './recurring-expenses.controller'
import { RecurringExpensesService } from './recurring-expenses.service'

@Module({
  imports: [ExpenseRecordDBModule, RecurringExpenseDBModule, StoredFilesModule],
  controllers: [ExpensesController, RecurringExpensesController],
  providers: [ExpensesService, RecurringExpensesService],
  exports: [RecurringExpensesService],
})
export class ExpensesModule {}
