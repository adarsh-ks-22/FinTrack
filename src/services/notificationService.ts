// ============================================================
// src/services/notificationService.ts
// Local notifications service for FinTrack using expo-notifications.
// Features:
// 1. Android Notification Channels (ledger_reminders, recurring_payments, budget_alerts)
// 2. Permission requests and useSettingsStore synchronization
// 3. Daily Evening Ledger Review scheduling (8:00 PM IST default)
// 4. Recurring Payment reminder scheduling with month-end date clamping
// 5. Immediate Budget Warning notifications on limit breaches
// 6. Safe fallbacks for web, unit tests, and Expo Go environments
// ============================================================

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { RecurringPaymentRecord, ExpenseType } from '@/types';
import { RecurringPayment } from '@/db/models/RecurringPayment';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { updateSettingsInDB } from '@/db/database';

// Channel Identifiers
export const CHANNEL_LEDGER_REMINDERS = 'ledger_reminders';
export const CHANNEL_RECURRING_PAYMENTS = 'recurring_payments';
export const CHANNEL_BUDGET_ALERTS = 'budget_alerts';

// Fixed notification identifier for daily review
export const EVENING_REVIEW_IDENTIFIER = 'fintrack_evening_ledger_review';

// Set up foreground notification presentation behavior
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (e) {
  // Safe fallback if notifications are not initialized
}

// --------------- Helper: Suffix Ordinal for Days (1st, 2nd, etc.) ---------------

export function getOrdinalSuffix(day: number): string {
  const j = day % 10;
  const k = day % 100;
  if (j === 1 && k !== 11) return `${day}st`;
  if (j === 2 && k !== 12) return `${day}nd`;
  if (j === 3 && k !== 13) return `${day}rd`;
  return `${day}th`;
}

// --------------- 1. Initialize Notification Channels ---------------

/**
 * Configure high-priority Android notification channels.
 * Safe to call on all platforms and handles native module fallbacks.
 */
export async function initNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    // 1. Evening Ledger Reminders Channel
    await Notifications.setNotificationChannelAsync(CHANNEL_LEDGER_REMINDERS, {
      name: 'Evening Ledger Reminders',
      description: 'Daily reminder to review and log daily expenses before bedtime',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366f1',
      sound: 'default',
      enableVibrate: true,
      showBadge: false,
    });

    // 2. Recurring Payment Reminders Channel
    await Notifications.setNotificationChannelAsync(CHANNEL_RECURRING_PAYMENTS, {
      name: 'Recurring Payment Reminders',
      description: 'Alerts for upcoming subscriptions, EMIs, and bills',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3b82f6',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    // 3. Budget Alerts Channel
    await Notifications.setNotificationChannelAsync(CHANNEL_BUDGET_ALERTS, {
      name: 'Budget Exceeded Warnings',
      description: 'Instant alerts when category or total monthly budgets are exceeded',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#ef4444',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  } catch (error) {
    console.warn('[NotificationService] Error initializing channels:', error);
  }
}

// --------------- 2. Request Notification Permissions ---------------

/**
 * Request notification permissions from the OS and sync state with useSettingsStore & DB.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let granted =
      existing.granted ||
      existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      granted =
        requested.granted ||
        requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    }

    useSettingsStore.getState().setNotificationsEnabled(granted);
    await updateSettingsInDB({ notificationsEnabled: granted });
    return granted;
  } catch (error) {
    console.warn('[NotificationService] Permission request failed:', error);
    return false;
  }
}

// --------------- Helper: Compute Today's Logged Spent ---------------

function calculateTodaySpent(): number {
  try {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    ).getTime();
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    ).getTime();

    const txStore = useTransactionStore.getState();
    const transactions = txStore.currentMonthTransactions || txStore.transactions || [];

    return transactions
      .filter((t) => t.timestamp >= startOfToday && t.timestamp <= endOfToday)
      .filter((t) => t.expenseType === ExpenseType.Needs || t.expenseType === ExpenseType.Wants)
      .reduce((sum, t) => sum + t.amount, 0);
  } catch {
    return 0;
  }
}

// --------------- 3. Daily Evening Ledger Review ---------------

/**
 * Schedules a recurring daily local notification at specified time (default 20:00 / 8:00 PM IST).
 * Cancels any existing evening reminder beforehand.
 */
export async function scheduleDailyEveningReview(
  timeString?: string,
  todaySpent?: number
): Promise<string | null> {
  try {
    // Check if notifications are enabled
    const settings = useSettingsStore.getState();
    if (!settings.notificationsEnabled) {
      return null;
    }

    // Cancel existing evening reminder
    await cancelDailyEveningReview();

    // Parse target hour and minute (default 20:00)
    const effectiveTime = timeString || '20:00';
    const parts = effectiveTime.split(':');
    const hour = parseInt(parts[0], 10) || 20;
    const minute = parseInt(parts[1], 10) || 0;

    // Calculate spend amount
    const currency = settings.currencySymbol || '₹';
    const spentAmount = todaySpent !== undefined ? todaySpent : calculateTodaySpent();
    const formattedSpent = spentAmount.toLocaleString('en-IN');

    const notificationId = await Notifications.scheduleNotificationAsync({
      identifier: EVENING_REVIEW_IDENTIFIER,
      content: {
        title: '🌙 Evening Ledger Review',
        body: `Today's logged spend: ${currency}${formattedSpent}. Tap to review or add any cash expenses before the day ends.`,
        data: { screen: 'transactions', type: 'evening_review' },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: CHANNEL_LEDGER_REMINDERS,
      },
    });

    return notificationId;
  } catch (error) {
    console.warn('[NotificationService] scheduleDailyEveningReview failed:', error);
    return null;
  }
}

/**
 * Cancels the daily evening ledger reminder.
 */
export async function cancelDailyEveningReview(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(EVENING_REVIEW_IDENTIFIER);
  } catch (e) {
    // Ignore cancellation errors
  }
}

// --------------- 4. Schedule Recurring Payment Notification ---------------

export type AnyRecurringPayment = RecurringPayment | RecurringPaymentRecord;

/**
 * Schedules an alert for a recurring payment:
 * - Calculates trigger date: `due_day - notify_days_before` at 09:00 AM IST.
 * - Clamps due date to last day of current/target month for short months (Feb 28/29, Apr 30, etc.).
 * - If current month's alert date has already passed, schedules for next month.
 */
export async function scheduleRecurringPaymentNotification(
  payment: AnyRecurringPayment
): Promise<string | null> {
  try {
    const settings = useSettingsStore.getState();
    if (!settings.notificationsEnabled) {
      return null;
    }

    const id = payment.id;
    const name = payment.name;
    const amount = Number(payment.amount) || 0;
    const dueDay = Number((payment as any).dueDay ?? (payment as any).due_day) || 1;
    const notifyDaysBefore =
      Number((payment as any).notifyDaysBefore ?? (payment as any).notify_days_before) || 1;
    const isActive = (payment as any).isActive ?? (payment as any).is_active ?? true;

    const notificationIdentifier = `recurring_${id}`;

    // Cancel any previous notification for this payment
    await Notifications.cancelScheduledNotificationAsync(notificationIdentifier);

    // If disabled, do not schedule
    if (!isActive) {
      return null;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    // Step A: Calculate for current month with month-end clamp
    const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const clampedDueDayCurrent = Math.min(dueDay, daysInCurrentMonth);

    const dueDateCurrent = new Date(
      currentYear,
      currentMonth,
      clampedDueDayCurrent,
      9,
      0,
      0,
      0
    );
    const triggerDateCurrent = new Date(
      dueDateCurrent.getTime() - notifyDaysBefore * 24 * 60 * 60 * 1000
    );
    triggerDateCurrent.setHours(9, 0, 0, 0);

    let finalTriggerDate = triggerDateCurrent;
    let finalClampedDay = clampedDueDayCurrent;

    // Step B: If current month's trigger has already passed, schedule for next month
    if (triggerDateCurrent.getTime() <= now.getTime()) {
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const daysInNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
      const clampedDueDayNext = Math.min(dueDay, daysInNextMonth);

      const dueDateNext = new Date(
        nextYear,
        nextMonth,
        clampedDueDayNext,
        9,
        0,
        0,
        0
      );
      const triggerDateNext = new Date(
        dueDateNext.getTime() - notifyDaysBefore * 24 * 60 * 60 * 1000
      );
      triggerDateNext.setHours(9, 0, 0, 0);

      finalTriggerDate = triggerDateNext;
      finalClampedDay = clampedDueDayNext;
    }

    const currency = settings.currencySymbol || '₹';
    const formattedAmount = amount.toLocaleString('en-IN');
    const daySuffix = getOrdinalSuffix(finalClampedDay);
    const dayWord = notifyDaysBefore === 1 ? 'day' : 'days';

    const scheduledId = await Notifications.scheduleNotificationAsync({
      identifier: notificationIdentifier,
      content: {
        title: 'Upcoming Bill Reminder',
        body: `${name} (${currency}${formattedAmount}) is due in ${notifyDaysBefore} ${dayWord} on the ${daySuffix}.`,
        data: { paymentId: id, screen: 'budget', type: 'recurring_bill' },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: finalTriggerDate,
        channelId: CHANNEL_RECURRING_PAYMENTS,
      },
    });

    return scheduledId;
  } catch (error) {
    console.warn(
      `[NotificationService] Failed to schedule recurring payment "${payment.name}":`,
      error
    );
    return null;
  }
}

/**
 * Cancels a recurring payment notification by ID.
 */
export async function cancelRecurringPaymentNotification(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(`recurring_${id}`);
  } catch (e) {
    // Ignore cancellation errors
  }
}

// --------------- 5. Reschedule All Recurring Reminders ---------------

/**
 * Reschedules all active recurring reminders.
 */
export async function rescheduleAllRecurringReminders(
  payments: AnyRecurringPayment[]
): Promise<void> {
  try {
    for (const payment of payments) {
      const isActive = (payment as any).isActive ?? (payment as any).is_active ?? true;
      if (isActive) {
        await scheduleRecurringPaymentNotification(payment);
      } else {
        await cancelRecurringPaymentNotification(payment.id);
      }
    }
  } catch (error) {
    console.warn('[NotificationService] rescheduleAllRecurringReminders failed:', error);
  }
}

// --------------- 6. Immediate Budget Warning Notification ---------------

/**
 * Triggers an immediate local notification when a budget limit is breached.
 */
export async function triggerBudgetWarningNotification(
  type: 'needs' | 'wants' | 'total',
  currentSpent: number,
  limit: number
): Promise<string | null> {
  try {
    const settings = useSettingsStore.getState();
    if (!settings.notificationsEnabled) {
      return null;
    }

    const currency = settings.currencySymbol || '₹';
    const typeLabel =
      type === 'needs'
        ? 'Needs'
        : type === 'wants'
        ? 'Wants'
        : 'Total Monthly';

    const formattedSpent = currentSpent.toLocaleString('en-IN');
    const formattedLimit = limit.toLocaleString('en-IN');
    const overAmount = Math.max(0, currentSpent - limit).toLocaleString('en-IN');

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⚠️ ${typeLabel} Budget Exceeded!`,
        body: `You have spent ${currency}${formattedSpent}, exceeding your ${typeLabel.toLowerCase()} limit of ${currency}${formattedLimit} by ${currency}${overAmount}. Tap to review your budget.`,
        data: { type, screen: 'budget', action: 'budget_breach' },
        sound: 'default',
      },
      trigger: {
        channelId: CHANNEL_BUDGET_ALERTS,
      },
    });

    return notificationId;
  } catch (error) {
    console.warn('[NotificationService] triggerBudgetWarningNotification failed:', error);
    return null;
  }
}
