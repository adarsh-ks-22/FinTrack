// ============================================================
// src/db/models/Budget.ts
// WatermelonDB model for the budgets table
// ============================================================

import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

export class Budget extends Model {
  static table = 'budgets';

  /**
   * Month stored as YYYYMM number, e.g. 202501 for January 2025.
   * This is the unique key per budget entry.
   */
  @field('month')
  month: number;

  @field('total_budget')
  totalBudget: number;

  /** Percentage allocated to Needs (0–100) */
  @field('needs_pct')
  needsPct: number;

  /** Percentage allocated to Wants (0–100) */
  @field('wants_pct')
  wantsPct: number;

  /** Percentage allocated to Savings (0–100) */
  @field('savings_pct')
  savingsPct: number;

  @readonly
  @date('created_at')
  createdAt: Date;

  @readonly
  @date('updated_at')
  updatedAt: Date;
}
