// ============================================================
// app/_layout.tsx
// Root layout: DB initialization, Settings hydration, Expo Router Stack
// ============================================================

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

// Prevent native splash screen from auto-hiding prematurely
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const [showSplashOverlay, setShowSplashOverlay] = useState(true);
  const splashFadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0.35)).current;

  // Pulse animation for the splash status indicator
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // When DB is initialized, hide native splash and smoothly fade out in-app branded splash
  useEffect(() => {
    if (dbReady) {
      SplashScreen.hideAsync().catch(() => {});
      const timer = setTimeout(() => {
        Animated.timing(splashFadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => {
          setShowSplashOverlay(false);
        });
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [dbReady, splashFadeAnim]);

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

      {/* ── Branded Smooth Splash Overlay (Concept 3 Aesthetic) ── */}
      {showSplashOverlay && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: splashFadeAnim,
              backgroundColor: '#080B14',
              zIndex: 99999,
            },
          ]}
          pointerEvents={dbReady ? 'none' : 'auto'}
        >
          <View className="flex-1 items-center justify-between px-6 py-20">
            {/* Top Empty Spacer */}
            <View className="h-4" />

            {/* Centered Brand Emblem & Identity (Concept 3: Precision Bars & Coin) */}
            <View className="items-center">
              {/* Emblem Container Squircle */}
              <View
                style={{
                  width: 104,
                  height: 104,
                  borderRadius: 30,
                  backgroundColor: '#0e1424',
                  borderColor: 'rgba(99, 102, 241, 0.4)',
                  borderWidth: 1.5,
                  shadowColor: '#6366f1',
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: 0.35,
                  shadowRadius: 24,
                  elevation: 12,
                }}
                className="items-center justify-center mb-6"
              >
                {/* Minimalist Concept 3 Geometry */}
                <View style={{ width: 60, height: 60, position: 'relative' }}>
                  {/* Vertical Stem */}
                  <View
                    style={{
                      position: 'absolute',
                      left: 6,
                      top: 4,
                      width: 10,
                      height: 52,
                      borderRadius: 5,
                      backgroundColor: '#6366f1',
                    }}
                  />
                  {/* Top Precision Bar */}
                  <View
                    style={{
                      position: 'absolute',
                      left: 6,
                      top: 4,
                      width: 44,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: '#818cf8',
                    }}
                  />
                  {/* Mid Precision Bar */}
                  <View
                    style={{
                      position: 'absolute',
                      left: 6,
                      top: 25,
                      width: 28,
                      height: 9,
                      borderRadius: 4.5,
                      backgroundColor: '#10b981',
                    }}
                  />
                  {/* Glowing Emerald Coin Dot */}
                  <View
                    style={{
                      position: 'absolute',
                      left: 42,
                      top: 24,
                      width: 11,
                      height: 11,
                      borderRadius: 5.5,
                      backgroundColor: '#10b981',
                      shadowColor: '#10b981',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.9,
                      shadowRadius: 8,
                      elevation: 5,
                    }}
                  />
                </View>
              </View>

              {/* Typography */}
              <Text
                style={{ letterSpacing: -0.5 }}
                className="text-3xl font-extrabold text-white mb-2"
              >
                FinTrack
              </Text>
              <Text
                style={{ letterSpacing: 2.2 }}
                className="text-[11px] font-semibold text-indigo-400 uppercase tracking-widest"
              >
                OFFLINE-FIRST PERSONAL FINANCE
              </Text>
            </View>

            {/* Bottom Status Indicator & Security Badge */}
            <View className="items-center w-full">
              <View
                style={{
                  backgroundColor: 'rgba(14, 20, 36, 0.9)',
                  borderColor: 'rgba(51, 65, 85, 0.6)',
                  borderWidth: 1,
                }}
                className="flex-row items-center rounded-full px-4 py-2 mb-4"
              >
                <Animated.View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: '#10b981',
                    marginRight: 8,
                    opacity: pulseAnim,
                  }}
                />
                <Text className="text-xs font-medium text-slate-300">
                  {dbReady ? 'Ready' : 'Syncing Local DB...'}
                </Text>
              </View>

              <Text className="text-[11px] text-slate-500 font-medium">
                100% On-Device Storage • Zero Cloud Leakage
              </Text>
            </View>
          </View>
        </Animated.View>
      )}
    </SafeAreaProvider>
  );
}
