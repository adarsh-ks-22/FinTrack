// ============================================================
// src/db/models/Settings.ts
// WatermelonDB model for the settings table (singleton row)
// ============================================================

import { Model } from '@nozbe/watermelondb';
import { field, readonly, date } from '@nozbe/watermelondb/decorators';

export class Settings extends Model {
  static table = 'settings';

  /** Currency symbol displayed in the UI, e.g. '₹' */
  @field('currency_symbol')
  currencySymbol!: string;

  /** ISO 4217 currency code, e.g. 'INR' */
  @field('currency_code')
  currencyCode!: string;

  /** Local time (HH:mm) for daily notification, e.g. '09:00' */
  @field('notification_time')
  notificationTime!: string;

  /** Whether the user has granted SMS READ permission */
  @field('sms_permission_granted')
  smsPermissionGranted!: boolean;

  /** Whether push/local notifications are enabled */
  @field('notifications_enabled')
  notificationsEnabled!: boolean;

  @readonly
  @date('created_at')
  createdAt!: Date;

  @readonly
  @date('updated_at')
  updatedAt!: Date;
}
