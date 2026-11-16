// ============================================================
// app/(tabs)/transactions.tsx
// Transactions list screen — Phase 2 full implementation
// FilterBar | Custom date range | TransactionCard FlatList
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parse,
  isValid,
} from 'date-fns';

import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { FAB } from '@/components/layout/FAB';
import { EmptyState } from '@/components/ui/EmptyState';
import { TransactionCard } from '@/components/transactions/TransactionCard';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { TransactionRecord } from '@/types';

// --------------- Filter types ---------------

type FilterKey = 'today' | 'week' | 'month' | 'custom';

interface FilterChip {
  key: FilterKey;
  label: string;
}

const FILTER_CHIPS: FilterChip[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
];

// --------------- Date range helpers ---------------

function getDateRange(filter: FilterKey, now: Date): { start: number; end: number } {
  switch (filter) {
    case 'today':
      return { start: startOfDay(now).getTime(), end: endOfDay(now).getTime() };
    case 'week':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }).getTime(),
        end: endOfWeek(now, { weekStartsOn: 1 }).getTime(),
      };
    case 'month':
    default:
      return { start: startOfMonth(now).getTime(), end: endOfMonth(now).getTime() };
  }
}

function parseCustomDate(str: string): Date | null {
  if (!str) return null;
  const parsed = parse(str, 'dd/MM/yyyy', new Date());
  return isValid(parsed) ? parsed : null;
}

// --------------- Main component ---------------

export default function TransactionsScreen() {
  const { transactions, getTransactionsByDateRange } = useTransactionStore();

  const [activeFilter, setActiveFilter] = useState<FilterKey>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customApplied, setCustomApplied] = useState(false);
  const [customError, setCustomError] = useState('');

  // ── Filtered transactions ──
  const filteredTransactions = useMemo<TransactionRecord[]>(() => {
    const now = new Date();

    if (activeFilter === 'custom' && customApplied) {
      const fromDate = parseCustomDate(customFrom);
      const toDate = parseCustomDate(customTo);
      if (fromDate && toDate) {
        return getTransactionsByDateRange(
          startOfDay(fromDate).getTime(),
          endOfDay(toDate).getTime()
        );
      }
      return [];
    }

    if (activeFilter === 'custom') {
      // Show all while user is typing custom dates
      return transactions;
    }

    const { start, end } = getDateRange(activeFilter, now);
    return getTransactionsByDateRange(start, end);
  }, [activeFilter, transactions, customApplied, customFrom, customTo]);

  // Sort descending by timestamp (store already sorts, but be explicit)
  const sorted = useMemo(
    () => [...filteredTransactions].sort((a, b) => b.timestamp - a.timestamp),
    [filteredTransactions]
  );

  const handleApplyCustom = useCallback(() => {
    const fromDate = parseCustomDate(customFrom);
    const toDate = parseCustomDate(customTo);
    if (!fromDate) {
      setCustomError('Invalid "From" date. Use DD/MM/YYYY');
      return;
    }
    if (!toDate) {
      setCustomError('Invalid "To" date. Use DD/MM/YYYY');
      return;
    }
    if (fromDate > toDate) {
      setCustomError('"From" date must be before "To" date');
      return;
    }
    setCustomError('');
    setCustomApplied(true);
  }, [customFrom, customTo]);

  const handleFilterChange = useCallback((key: FilterKey) => {
    setActiveFilter(key);
    setCustomApplied(false);
    setCustomError('');
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: TransactionRecord }) => <TransactionCard item={item} deletable />,
    []
  );

  const keyExtractor = useCallback((item: TransactionRecord) => item.id, []);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScreenHeader
        title="Transactions"
        subtitle={`${sorted.length} record${sorted.length !== 1 ? 's' : ''}`}
      />

      {/* ── Filter chips ── */}
      <View className="bg-white border-b border-gray-100 py-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {FILTER_CHIPS.map((chip) => {
            const isActive = activeFilter === chip.key;
            return (
              <Pressable
                key={chip.key}
                onPress={() => handleFilterChange(chip.key)}
                className={`rounded-full px-4 py-1.5 ${
                  isActive ? 'bg-indigo-600' : 'bg-gray-100'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    isActive ? 'text-white' : 'text-gray-600'
                  }`}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Custom date range inputs ── */}
        {activeFilter === 'custom' && (
          <View className="mt-2 px-4">
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <Text className="mb-0.5 text-xs text-gray-500">From</Text>
                <TextInput
                  value={customFrom}
                  onChangeText={(v) => {
                    setCustomFrom(v);
                    setCustomApplied(false);
                    setCustomError('');
                  }}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
                />
              </View>
              <View className="flex-1">
                <Text className="mb-0.5 text-xs text-gray-500">To</Text>
                <TextInput
                  value={customTo}
                  onChangeText={(v) => {
                    setCustomTo(v);
                    setCustomApplied(false);
                    setCustomError('');
                  }}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800"
                />
              </View>
              <Pressable
                onPress={handleApplyCustom}
                className="mt-4 rounded-lg bg-indigo-600 px-3 py-2"
              >
                <Text className="text-sm font-semibold text-white">Apply</Text>
              </Pressable>
            </View>
            {customError ? (
              <Text className="mt-1 text-xs text-red-500">{customError}</Text>
            ) : null}
          </View>
        )}
      </View>

      {/* ── Transaction list ── */}
      {sorted.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <EmptyState
            icon="receipt-outline"
            title="No transactions"
            description={
              activeFilter === 'today'
                ? 'No transactions today yet.'
                : activeFilter === 'week'
                ? 'No transactions this week.'
                : activeFilter === 'custom'
                ? 'No transactions in the selected range.'
                : 'No transactions this month. Add one!'
            }
            actionLabel="Add Transaction"
            onAction={() => router.push('/modals/add-transaction')}
          />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
        />
      )}

      <FAB
        icon="add"
        onPress={() => router.push('/modals/add-transaction')}
        accessibilityLabel="Add new transaction"
      />
    </SafeAreaView>
  );
}
