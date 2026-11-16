// ============================================================
// app/(tabs)/index.tsx
// Home / Dashboard screen — Phase 3 full implementation
// Spec Layout:
// 1. Total Expenditure Counter (up to the current minute)
// 2. Budget Exceeded Warning Banner (if exceeded)
// 3. Navigation CTA: "📋 View All Transactions" (DIRECTLY ABOVE pie chart)
// 4. Category Pie / Donut Chart (<ExpensePieChart />)
// 5. Budget Summary & Progress Bars (Needs, Wants, Savings)
// 6. Recent Transactions Ledger Preview
// 7. FAB for instant expense addition
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { FAB } from '@/components/layout/FAB';
import { CurrencyText } from '@/components/ui/CurrencyText';
import { EmptyState } from '@/components/ui/EmptyState';
import { ToastNotification, showToast } from '@/components/ui/ToastNotification';
import { BudgetProgressBar } from '@/components/budget/BudgetProgressBar';
import { ExpensePieChart } from '@/components/charts/ExpensePieChart';
import { TransactionCard } from '@/components/transactions/TransactionCard';
import { useBudgetStore } from '@/stores/useBudgetStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

export default function HomeScreen() {
  const {
    totalBudget,
    totalSpent,
    remainingBudget,
    budgetExceeded,
    needsSpent,
    wantsSpent,
    savedSoFar,
  } = useBudgetStore();

  const { currentMonthTransactions } = useTransactionStore();
  const { currencySymbol } = useSettingsStore();

  // Current time formatted up to the current minute
  const [currentMinuteText, setCurrentMinuteText] = useState(() =>
    format(new Date(), 'MMM dd, yyyy • h:mm a')
  );

  // Update clock display every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentMinuteText(format(new Date(), 'MMM dd, yyyy • h:mm a'));
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Entrance animations for the main expenditure card
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 65,
        friction: 9,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Show Toast when budget is exceeded
  const prevExceeded = useRef(false);
  useEffect(() => {
    if (budgetExceeded && !prevExceeded.current) {
      showToast({
        message: '⚠️ Warning: Monthly budget has been exceeded!',
        variant: 'warning',
        duration: 4500,
      });
    }
    prevExceeded.current = budgetExceeded;
  }, [budgetExceeded]);

  // Last 5 transactions for recent list preview
  const recentTransactions = currentMonthTransactions.slice(0, 5);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      {/* Toast Notification Container */}
      <ToastNotification />

      <ScreenHeader
        title="FinTrack"
        subtitle="Offline Personal Finance Tracker"
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Total Expenditure Counter Card (Up to the current minute) ── */}
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}
          className="mx-4 mt-4 rounded-3xl bg-indigo-600 p-5 shadow-md"
        >
          {/* Header Row: Label + Live Time Marker */}
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase tracking-wider text-indigo-200">
              Total Expenses This Month
            </Text>
            <View className="flex-row items-center rounded-full bg-indigo-700/60 px-2.5 py-1">
              <View className="mr-1.5 h-2 w-2 rounded-full bg-green-400" />
              <Text className="text-[11px] font-medium text-indigo-100">
                {currentMinuteText}
              </Text>
            </View>
          </View>

          {/* Large Real-Time Counter */}
          <View className="mt-2">
            <CurrencyText
              amount={totalSpent}
              currencySymbol={currencySymbol}
              className="text-4xl font-extrabold text-white tracking-tight"
            />
          </View>

          {/* Budget & Remaining Row */}
          <View className="mt-4 flex-row items-center justify-between border-t border-indigo-500/40 pt-3">
            <View>
              <Text className="text-xs font-medium text-indigo-200">Total Budget</Text>
              <CurrencyText
                amount={totalBudget}
                currencySymbol={currencySymbol}
                className="mt-0.5 text-base font-bold text-white"
              />
            </View>

            <View className="items-end">
              <Text className="text-xs font-medium text-indigo-200">
                {budgetExceeded ? 'Exceeded By' : 'Remaining'}
              </Text>
              <CurrencyText
                amount={budgetExceeded ? totalSpent - totalBudget : remainingBudget}
                currencySymbol={currencySymbol}
                className={`mt-0.5 text-base font-bold ${
                  budgetExceeded ? 'text-red-300' : 'text-emerald-300'
                }`}
              />
            </View>
          </View>
        </Animated.View>

        {/* ── Visual Warning Banner When Budget Is Exceeded ── */}
        {budgetExceeded && (
          <View className="mx-4 mt-3 flex-row items-center rounded-2xl bg-red-500/15 border border-red-400/40 p-3.5">
            <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-red-500">
              <Ionicons name="warning" size={18} color="#ffffff" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold text-red-800">
                Monthly Budget Exceeded!
              </Text>
              <Text className="text-xs text-red-700">
                You have spent{' '}
                <CurrencyText
                  amount={totalSpent - totalBudget}
                  currencySymbol={currencySymbol}
                  className="font-bold text-red-800"
                />{' '}
                beyond your set limit.
              </Text>
            </View>
          </View>
        )}

        {/* ── 2. Navigation CTA: View All Transactions (DIRECTLY ABOVE Pie Chart) ── */}
        <Pressable
          onPress={() => router.push('/(tabs)/transactions')}
          className="mx-4 mt-4 mb-2 flex-row items-center justify-between rounded-2xl bg-white px-4 py-3.5 shadow-sm border border-indigo-100"
          style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, elevation: 1 }]}
        >
          <View className="flex-row items-center">
            <View className="mr-3 h-9 w-9 items-center justify-center rounded-xl bg-indigo-50">
              <Text className="text-base">📋</Text>
            </View>
            <View>
              <Text className="text-sm font-bold text-gray-900">
                View All Transactions
              </Text>
              <Text className="text-xs text-gray-500">
                Browse, search, and manage ledger entries
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#4f46e5" />
        </Pressable>

        {/* ── 3. Category Pie Chart (DIRECTLY BELOW Transactions Button) ── */}
        <View className="mt-1">
          <ExpensePieChart />
        </View>

        {/* ── 4. Budget Summary & Progress Bars (Needs, Wants, Savings) ── */}
        <View className="mt-1">
          <BudgetProgressBar />
        </View>

        {/* ── 5. Recent Transactions Section ── */}
        <View className="mx-4 mt-3 mb-2 flex-row items-center justify-between">
          <Text className="text-base font-bold text-gray-800">
            Recent Transactions
          </Text>
          {recentTransactions.length > 0 && (
            <Pressable onPress={() => router.push('/(tabs)/transactions')}>
              <Text className="text-xs font-semibold text-indigo-600">See all</Text>
            </Pressable>
          )}
        </View>

        {recentTransactions.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No transactions this month"
            description="Tap the + button below to add your first expense."
          />
        ) : (
          recentTransactions.map((tx) => (
            <TransactionCard key={tx.id} item={tx} deletable={false} />
          ))
        )}
      </ScrollView>

      {/* Floating Action Button for New Transaction */}
      <FAB
        onPress={() => router.push('/modals/add-transaction')}
        icon="add"
        accessibilityLabel="Add Expense"
      />
    </SafeAreaView>
  );
}
