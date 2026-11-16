// ============================================================
// src/db/schema.ts
// WatermelonDB schema definition for all 4 tables
// ============================================================

import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'transactions',
      columns: [
        { name: 'amount', type: 'number', isIndexed: true },
        { name: 'category', type: 'string', isIndexed: true },
        { name: 'expense_type', type: 'string', isIndexed: true },
        { name: 'source', type: 'string' },
        { name: 'comments', type: 'string', isOptional: true },
        { name: 'timestamp', type: 'number', isIndexed: true },
        { name: 'raw_sms', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'budgets',
      columns: [
        { name: 'month', type: 'number', isIndexed: true },
        { name: 'total_budget', type: 'number' },
        { name: 'needs_pct', type: 'number' },
        { name: 'wants_pct', type: 'number' },
        { name: 'savings_pct', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'recurring_payments',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'amount', type: 'number' },
        { name: 'category', type: 'string' },
        { name: 'expense_type', type: 'string' },
        { name: 'due_day', type: 'number' },
        { name: 'notify_days_before', type: 'number' },
        { name: 'is_active', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'settings',
      columns: [
        { name: 'currency_symbol', type: 'string' },
        { name: 'currency_code', type: 'string' },
        { name: 'notification_time', type: 'string' },
        { name: 'sms_permission_granted', type: 'boolean' },
        { name: 'notifications_enabled', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
});
