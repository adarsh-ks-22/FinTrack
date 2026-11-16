// ============================================================
// src/db/models/RecurringPayment.ts
// WatermelonDB model for the recurring_payments table
// ============================================================

import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';
import { Category, ExpenseType } from '@/types';

export class RecurringPayment extends Model {
  static table = 'recurring_payments';

  @field('name')
  name: string;

  @field('amount')
  amount: number;

  @field('category')
  category: Category | string;

  @field('expense_type')
  expenseType: ExpenseType;

  /** Day of month (1–31) when payment is due */
  @field('due_day')
  dueDay: number;

  /** How many days before due_day to send a notification */
  @field('notify_days_before')
  notifyDaysBefore: number;

  /** Whether this recurring payment is currently active */
  @field('is_active')
  isActive: boolean;

  @readonly
  @date('created_at')
  createdAt: Date;

  @readonly
  @date('updated_at')
  updatedAt: Date;
}
