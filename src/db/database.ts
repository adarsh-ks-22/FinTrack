// ============================================================
// src/db/database.ts
// WatermelonDB singleton — initializes the database and
// ensures a default Settings row exists on first launch.
// ============================================================

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { NativeModules, Platform } from 'react-native';

import { schema } from './schema';
import { Transaction } from './models/Transaction';
import { Budget } from './models/Budget';
import { RecurringPayment } from './models/RecurringPayment';
import { Settings } from './models/Settings';
import { DEFAULT_SETTINGS, IST_TIMEZONE } from '@/constants/categories';
import { formatInTimeZone } from 'date-fns-tz';

// --------------- Adapter ---------------

// In Expo Go, third-party native modules are not bundled into the prebuilt client.
// If WMDatabaseBridge is present (e.g. in Expo Dev Client / prebuild), use SQLiteAdapter.
// Otherwise, seamlessly fall back to LokiJSAdapter so the app runs smoothly in Expo Go.
const hasNativeBridge =
  Platform.OS !== 'web' &&
  Boolean(
    (NativeModules as any)?.WMDatabaseBridge ||
    (globalThis as any)?.nativeWatermelonCreateAdapter
  );

const adapter = hasNativeBridge
  ? new SQLiteAdapter({
      schema,
      migrations: undefined,
      jsi: true,
      onSetUpError: (error) => {
        console.error('[WatermelonDB] SQLite setup error:', error);
      },
    })
  : new LokiJSAdapter({
      schema,
      useWebWorker: false,
      useIncrementalIndexedDB: false,
      onSetUpError: (error) => {
        console.error('[WatermelonDB] LokiJS setup error:', error);
      },
    });

// --------------- Database singleton ---------------

export const database = new Database({
  adapter,
  modelClasses: [Transaction, Budget, RecurringPayment, Settings],
});

// --------------- Collection helpers ---------------

export const transactionsCollection = database.get<Transaction>('transactions');
export const budgetsCollection = database.get<Budget>('budgets');
export const recurringCollection = database.get<RecurringPayment>('recurring_payments');
export const settingsCollection = database.get<Settings>('settings');

// --------------- Default Settings initializer ---------------

/**
 * Checks whether a Settings row already exists in the DB.
 * If not, creates one with default values.
 * Returns the Settings record (existing or newly created).
 */
export async function ensureDefaultSettings(): Promise<Settings> {
  const existing = await settingsCollection.query().fetch();

  if (existing.length > 0) {
    return existing[0];
  }

  let newSettings!: Settings;

  await database.write(async () => {
    newSettings = await settingsCollection.create((record) => {
      record.currencySymbol = DEFAULT_SETTINGS.currencySymbol;
      record.currencyCode = DEFAULT_SETTINGS.currencyCode;
      record.notificationTime = DEFAULT_SETTINGS.notificationTime;
      record.smsPermissionGranted = DEFAULT_SETTINGS.smsPermissionGranted;
      record.notificationsEnabled = DEFAULT_SETTINGS.notificationsEnabled;
    });
  });

  return newSettings;
}

/**
 * Updates the Settings row in the DB with partial values.
 * Assumes a Settings row already exists (call ensureDefaultSettings first).
 */
export async function updateSettingsInDB(
  partial: Partial<{
    currencySymbol: string;
    currencyCode: string;
    notificationTime: string;
    smsPermissionGranted: boolean;
    notificationsEnabled: boolean;
  }>
): Promise<void> {
  const existing = await settingsCollection.query().fetch();
  if (existing.length === 0) {
    console.warn('[DB] updateSettingsInDB called before settings row was created');
    return;
  }

  const record = existing[0];
  await database.write(async () => {
    await record.update((s) => {
      if (partial.currencySymbol !== undefined) s.currencySymbol = partial.currencySymbol!;
      if (partial.currencyCode !== undefined) s.currencyCode = partial.currencyCode!;
      if (partial.notificationTime !== undefined) s.notificationTime = partial.notificationTime!;
      if (partial.smsPermissionGranted !== undefined) s.smsPermissionGranted = partial.smsPermissionGranted!;
      if (partial.notificationsEnabled !== undefined) s.notificationsEnabled = partial.notificationsEnabled!;
    });
  });
}

// --------------- Database Storage & Backup Helpers ---------------

export interface DatabaseStorageInfo {
  transactionCount: number;
  recurringCount: number;
  budgetCount: number;
  estimatedSizeBytes: number;
  estimatedSizeFormatted: string;
}

/**
 * Returns storage metrics: counts and calculated SQLite storage usage.
 */
export async function getDatabaseStorageInfo(): Promise<DatabaseStorageInfo> {
  try {
    const txCount = await transactionsCollection.query().fetchCount();
    const recCount = await recurringCollection.query().fetchCount();
    const bgCount = await budgetsCollection.query().fetchCount();

    // SQLite page base ~32KB + record payload approximations
    const estimatedSizeBytes = 32768 + (txCount * 280) + (recCount * 210) + (bgCount * 140);
    const estimatedSizeFormatted =
      estimatedSizeBytes >= 1048576
        ? `${(estimatedSizeBytes / 1048576).toFixed(2)} MB`
        : `${(estimatedSizeBytes / 1024).toFixed(1)} KB`;

    return {
      transactionCount: txCount,
      recurringCount: recCount,
      budgetCount: bgCount,
      estimatedSizeBytes,
      estimatedSizeFormatted,
    };
  } catch (error) {
    console.error('[DB] Error getting storage info:', error);
    return {
      transactionCount: 0,
      recurringCount: 0,
      budgetCount: 0,
      estimatedSizeBytes: 32768,
      estimatedSizeFormatted: '32.0 KB',
    };
  }
}

/**
 * Serializes all local WatermelonDB tables into a structured JSON backup string.
 */
export async function exportDatabaseBackupJSON(): Promise<string> {
  const [transactions, recurring, budgets, settings] = await Promise.all([
    transactionsCollection.query().fetch(),
    recurringCollection.query().fetch(),
    budgetsCollection.query().fetch(),
    settingsCollection.query().fetch(),
  ]);

  const activeSettings = settings[0];
  const now = new Date();

  const backupData = {
    appName: 'FinTrack',
    version: '1.0.0',
    exportTimestampUTC: now.toISOString(),
    exportTimestampIST: formatInTimeZone(now, IST_TIMEZONE, 'dd MMM yyyy, hh:mm:ss a zzz'),
    offlineStatus: '100% On-Device Local SQLite Storage',
    metadata: {
      totalTransactions: transactions.length,
      totalRecurringPayments: recurring.length,
      totalBudgets: budgets.length,
    },
    settings: activeSettings
      ? {
          currencySymbol: activeSettings.currencySymbol,
          currencyCode: activeSettings.currencyCode,
          notificationTime: activeSettings.notificationTime,
          smsPermissionGranted: activeSettings.smsPermissionGranted,
          notificationsEnabled: activeSettings.notificationsEnabled,
        }
      : DEFAULT_SETTINGS,
    budgets: budgets.map((b) => ({
      id: b.id,
      month: b.month,
      totalBudget: b.totalBudget,
      needsPct: b.needsPct,
      wantsPct: b.wantsPct,
      savingsPct: b.savingsPct,
      createdAt: b.createdAt.getTime(),
      updatedAt: b.updatedAt.getTime(),
    })),
    recurringPayments: recurring.map((r) => ({
      id: r.id,
      name: r.name,
      amount: r.amount,
      category: r.category,
      expenseType: r.expenseType,
      dueDay: r.dueDay,
      notifyDaysBefore: r.notifyDaysBefore,
      isActive: r.isActive,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      amount: t.amount,
      category: t.category,
      expenseType: t.expenseType,
      source: t.source,
      comments: t.comments ?? null,
      timestamp: t.timestamp,
      timestampIST: formatInTimeZone(new Date(t.timestamp), IST_TIMEZONE, 'dd MMM yyyy, hh:mm a'),
      rawSms: t.rawSms ?? null,
      createdAt: t.createdAt.getTime(),
      updatedAt: t.updatedAt.getTime(),
    })),
  };

  return JSON.stringify(backupData, null, 2);
}

/**
 * Completely wipes all local transactions, budgets, and recurring payments,
 * and resets Settings row to factory defaults.
 */
export async function resetDatabaseToDefaults(): Promise<void> {
  await database.write(async () => {
    const [txRecords, recRecords, budgetRecords, settingsRecords] = await Promise.all([
      transactionsCollection.query().fetch(),
      recurringCollection.query().fetch(),
      budgetsCollection.query().fetch(),
      settingsCollection.query().fetch(),
    ]);

    for (const t of txRecords) {
      await t.destroyPermanently();
    }
    for (const r of recRecords) {
      await r.destroyPermanently();
    }
    for (const b of budgetRecords) {
      await b.destroyPermanently();
    }

    if (settingsRecords.length > 0) {
      await settingsRecords[0].update((s) => {
        s.currencySymbol = DEFAULT_SETTINGS.currencySymbol;
        s.currencyCode = DEFAULT_SETTINGS.currencyCode;
        s.notificationTime = DEFAULT_SETTINGS.notificationTime;
        s.smsPermissionGranted = DEFAULT_SETTINGS.smsPermissionGranted;
        s.notificationsEnabled = DEFAULT_SETTINGS.notificationsEnabled;
      });
    }
  });
}

