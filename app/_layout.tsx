// ============================================================
// app/_layout.tsx
// Root layout: DB initialization, Settings hydration, Expo Router Stack
// ============================================================

import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '../global.css';

import { database, ensureDefaultSettings } from '@/db/database';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useRecurringStore } from '@/stores/useRecurringStore';
import { useBudgetStore } from '@/stores/useBudgetStore';
import { Category, ExpenseType, Source, TransactionRecord, RecurringPaymentRecord, BudgetRecord } from '@/types';
import { Transaction } from '@/db/models/Transaction';
import { RecurringPayment } from '@/db/models/RecurringPayment';
import { Budget } from '@/db/models/Budget';

import { ToastNotification } from '@/components/ui/ToastNotification';
import {
  initNotificationChannels,
  scheduleDailyEveningReview,
  rescheduleAllRecurringReminders,
} from '@/services/notificationService';
import { initRealtimeSmsListener, syncSmsInbox } from '@/services/smsService';

// Helper: map WatermelonDB Transaction model → plain TransactionRecord
function mapTransaction(t: Transaction): TransactionRecord {
  return {
    id: t.id,
    amount: t.amount,
    category: t.category,
    expenseType: t.expenseType,
    source: t.source,
    comments: t.comments ?? undefined,
    timestamp: t.timestamp,
    rawSms: t.rawSms ?? undefined,
    createdAt: t.createdAt.getTime(),
    updatedAt: t.updatedAt.getTime(),
  };
}

// Helper: map WatermelonDB RecurringPayment model → plain record
function mapRecurring(r: RecurringPayment): RecurringPaymentRecord {
  return {
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
  };
}

// Helper: map WatermelonDB Budget model → plain BudgetRecord
function mapBudget(b: Budget): BudgetRecord {
  return {
    id: b.id,
    month: b.month,
    totalBudget: b.totalBudget,
    needsPct: b.needsPct,
    wantsPct: b.wantsPct,
    savingsPct: b.savingsPct,
    createdAt: b.createdAt.getTime(),
    updatedAt: b.updatedAt.getTime(),
  };
}

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);

  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const loadTransactions = useTransactionStore((s) => s.loadTransactions);
  const loadRecurring = useRecurringStore((s) => s.loadRecurring);
  const setBudget = useBudgetStore((s) => s.setBudget);
  const syncTransactions = useBudgetStore((s) => s.syncTransactions);

  useEffect(() => {
    let transactionSub: { unsubscribe: () => void } | null = null;
    let recurringSub: { unsubscribe: () => void } | null = null;
    let budgetSub: { unsubscribe: () => void } | null = null;

    async function initDB() {
      try {
        // 1. Ensure default settings row exists, then hydrate Zustand
        const settingsRecord = await ensureDefaultSettings();
        hydrateSettings({
          currencySymbol: settingsRecord.currencySymbol,
          currencyCode: settingsRecord.currencyCode,
          notificationTime: settingsRecord.notificationTime,
          smsPermissionGranted: settingsRecord.smsPermissionGranted,
          notificationsEnabled: settingsRecord.notificationsEnabled,
        });

        // Initialize Android Notification Channels & Daily Evening Ledger Review
        await initNotificationChannels();
        await scheduleDailyEveningReview(settingsRecord.notificationTime);

        // 2. Compute current month boundaries (IST-aware approximation)
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const startTs = startOfMonth.getTime();
        const currentYYYYMM =
          now.getFullYear() * 100 + (now.getMonth() + 1);

        // 3. Set up reactive WatermelonDB observers

        // Transactions observer
        const txCollection = database.get<Transaction>('transactions');
        transactionSub = txCollection
          .query()
          .observe()
          .subscribe((records) => {
            const all = records.map(mapTransaction);
            const currentMonth = all.filter((t) => t.timestamp >= startTs);
            loadTransactions(all, currentMonth);
            syncTransactions(currentMonth);
          });

        // Recurring payments observer
        const recCollection = database.get<RecurringPayment>('recurring_payments');
        recurringSub = recCollection
          .query()
          .observe()
          .subscribe((records) => {
            const mapped = records.map(mapRecurring);
            loadRecurring(mapped);
            rescheduleAllRecurringReminders(mapped);
          });

        // Budget observer (current month only)
        const budgetCollection = database.get<Budget>('budgets');
        budgetSub = budgetCollection
          .query()
          .observe()
          .subscribe((records) => {
            const currentBudget = records.find((b) => b.month === currentYYYYMM);
            if (currentBudget) {
              setBudget(mapBudget(currentBudget));
            }
          });

        // Initialize real-time SMS broadcast listener & background sync
        const smsCleanup = initRealtimeSmsListener();
        // Quietly sync any recent messages arrived while app was closed if permission is granted
        if (useSettingsStore.getState().smsPermissionGranted) {
          syncSmsInbox(50, 14).catch(() => {});
        }

        setDbReady(true);
      } catch (error) {
        console.error('[RootLayout] DB initialization failed:', error);
        // Still show UI even if DB init fails — graceful degradation
        setDbReady(true);
      }
    }

    initDB();

    return () => {
      transactionSub?.unsubscribe();
      recurringSub?.unsubscribe();
      budgetSub?.unsubscribe();
    };
  }, []);

  if (!dbReady) {
    return (
      <SafeAreaProvider>
        <View className="flex-1 items-center justify-center bg-white dark:bg-gray-900">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="modals/add-transaction"
          options={{
            presentation: 'modal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="modals/add-recurring"
          options={{
            presentation: 'modal',
            headerShown: false,
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
      <ToastNotification />
    </SafeAreaProvider>
  );
}
