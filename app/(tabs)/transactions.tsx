// ============================================================
// app/(tabs)/transactions.tsx
// Transactions list screen — Phase 2 full implementation
// FilterBar | Custom date range | TransactionCard FlatList | SMS Sync
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TouchableOpacity,
  TextInput,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parse,
  isValid,
  format,
} from 'date-fns';

import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { FAB } from '@/components/layout/FAB';
import { EmptyState } from '@/components/ui/EmptyState';
import { TransactionCard } from '@/components/transactions/TransactionCard';
import { CalendarPickerModal } from '@/components/ui/CalendarPickerModal';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { syncSmsInbox } from '@/services/smsService';
import { TransactionRecord } from '@/types';

// --------------- Filter types ---------------

type FilterKey = 'today' | 'week' | 'month' | 'custom';

interface FilterChip {
  key: FilterKey;
  label: string;
}

const FILTER_CHIPS: FilterChip[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This\u00A0Week' },
  { key: 'month', label: 'This\u00A0Month' },
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<'from' | 'to' | null>(null);

  // ── Sync SMS from Inbox Handler ──
  const handleSyncSms = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncSmsInbox(150, 30);
    } catch (err) {
      console.error('[TransactionsScreen] SMS inbox sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

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

  const handleSelectCalendarDate = useCallback(
    (date: Date) => {
      const formatted = format(date, 'dd/MM/yyyy');
      if (calendarTarget === 'from') {
        setCustomFrom(formatted);
        setCustomApplied(false);
        setCustomError('');
      } else if (calendarTarget === 'to') {
        setCustomTo(formatted);
        setCustomApplied(false);
        setCustomError('');
      }
      setCalendarTarget(null);
    },
    [calendarTarget]
  );

  const renderItem = useCallback(
    ({ item }: { item: TransactionRecord }) => <TransactionCard item={item} deletable />,
    []
  );

  const keyExtractor = useCallback((item: TransactionRecord) => item.id, []);

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={['top']}>
      <ScreenHeader
        title="Transactions"
        subtitle={`${sorted.length} record${sorted.length !== 1 ? 's' : ''}`}
        rightAction={{
          icon: 'sync-outline',
          loading: isSyncing,
          onPress: handleSyncSms,
          accessibilityLabel: 'Sync SMS from inbox',
        }}
      />

      {/* ── SMS Quick Sync Action Banner ── */}
      <View className="flex-row items-center justify-between border-b border-indigo-100 bg-indigo-50/70 px-4 py-2 dark:border-gray-800 dark:bg-gray-900">
        <View className="mr-2 flex-1 flex-row items-center">
          <Ionicons name="chatbubbles-outline" size={15} color="#6366f1" />
          <Text
            className="ml-1.5 text-xs text-indigo-900 dark:text-indigo-200"
            numberOfLines={1}
          >
            Auto-detect bank debit SMS
          </Text>
        </View>
        <Pressable
          onPress={handleSyncSms}
          disabled={isSyncing}
          className="flex-row items-center rounded-lg bg-indigo-600 px-3 py-1.5 active:bg-indigo-700"
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#ffffff" style={{ transform: [{ scale: 0.75 }] }} />
          ) : (
            <Ionicons name="sync" size={12} color="#ffffff" />
          )}
          <Text className="ml-1 text-xs font-bold text-white">
            {isSyncing ? 'Syncing...' : 'Sync SMS'}
          </Text>
        </Pressable>
      </View>

      {/* ── Filter chips ── */}
      <View className="border-b border-gray-100 bg-white py-3 dark:border-gray-800 dark:bg-gray-900">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
        >
          {FILTER_CHIPS.map((chip) => {
            const isActive = activeFilter === chip.key;
            return (
              <Pressable
                key={chip.key}
                onPress={() => handleFilterChange(chip.key)}
                className={`flex-row items-center justify-center rounded-full px-4 py-2 shrink-0 ${
                  isActive ? 'bg-indigo-600' : 'bg-gray-100 dark:bg-gray-800'
                }`}
                style={{ flexShrink: 0 }}
              >
                <Text
                  numberOfLines={1}
                  className={`text-sm font-medium ${
                    isActive ? 'text-white' : 'text-gray-600 dark:text-gray-300'
                  }`}
                  style={{ flexShrink: 0, includeFontPadding: false }}
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
                <Text className="mb-0.5 text-xs text-gray-500 dark:text-gray-400">From</Text>
                <View className="flex-row items-center rounded-lg border border-gray-200 bg-gray-50 px-2.5 dark:border-gray-700 dark:bg-gray-800">
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
                    className="flex-1 py-2 text-sm text-gray-800 dark:text-gray-100"
                  />
                  <TouchableOpacity
                    onPress={() => setCalendarTarget('from')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="p-1"
                    accessibilityLabel="Select from date"
                  >
                    <Ionicons name="calendar-outline" size={17} color="#6366f1" />
                  </TouchableOpacity>
                </View>
              </View>

              <View className="flex-1">
                <Text className="mb-0.5 text-xs text-gray-500 dark:text-gray-400">To</Text>
                <View className="flex-row items-center rounded-lg border border-gray-200 bg-gray-50 px-2.5 dark:border-gray-700 dark:bg-gray-800">
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
                    className="flex-1 py-2 text-sm text-gray-800 dark:text-gray-100"
                  />
                  <TouchableOpacity
                    onPress={() => setCalendarTarget('to')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="p-1"
                    accessibilityLabel="Select to date"
                  >
                    <Ionicons name="calendar-outline" size={17} color="#6366f1" />
                  </TouchableOpacity>
                </View>
              </View>

              <Pressable
                onPress={handleApplyCustom}
                className="mt-4 rounded-lg bg-indigo-600 px-3 py-2 active:bg-indigo-700"
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
                : 'No transactions this month. Tap Sync SMS or Add one!'
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
          refreshControl={
            <RefreshControl
              refreshing={isSyncing}
              onRefresh={handleSyncSms}
              colors={['#4f46e5']}
              tintColor="#4f46e5"
            />
          }
        />
      )}

      <FAB
        icon="add"
        onPress={() => router.push('/modals/add-transaction')}
        accessibilityLabel="Add new transaction"
      />

      <CalendarPickerModal
        visible={calendarTarget !== null}
        onClose={() => setCalendarTarget(null)}
        onSelectDate={handleSelectCalendarDate}
        title={calendarTarget === 'from' ? "Select 'From' Date" : "Select 'To' Date"}
        initialDate={
          calendarTarget === 'from'
            ? parseCustomDate(customFrom) || new Date()
            : parseCustomDate(customTo) || new Date()
        }
        minDate={
          calendarTarget === 'to' && customFrom
            ? parseCustomDate(customFrom) || undefined
            : undefined
        }
      />
    </SafeAreaView>
  );
}
