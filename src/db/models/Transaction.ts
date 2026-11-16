// ============================================================
// src/db/models/Transaction.ts
// WatermelonDB model for the transactions table
// ============================================================

import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';
import { Category, ExpenseType, Source } from '@/types';

export class Transaction extends Model {
  static table = 'transactions';

  @field('amount')
  amount!: number;

  @field('category')
  category!: Category;

  @field('expense_type')
  expenseType!: ExpenseType;

  @field('source')
  source!: Source;

  @field('comments')
  comments!: string | null;

  @field('timestamp')
  timestamp!: number;

  @field('raw_sms')
  rawSms!: string | null;

  @readonly
  @date('created_at')
  createdAt!: Date;

  @readonly
  @date('updated_at')
  updatedAt!: Date;
}
