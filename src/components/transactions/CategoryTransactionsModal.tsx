// ============================================================
// src/components/transactions/CategoryTransactionsModal.tsx
// Interactive bottom-sheet modal for drilling down into transactions
// under a specific category directly from the Home Screen breakdown.
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { TransactionCard } from '@/components/transactions/TransactionCard';
import { CurrencyText } from '@/components/ui/CurrencyText';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Category, TransactionRecord } from '@/types';
import {
  getCategoryMeta,
  EXPENSE_TYPE_LABELS,
  EXPENSE_TYPE_COLORS,
  EXPENSE_TYPE_BG_COLORS,
} from '@/constants/categories';
import { getCategoryColor } from '@/components/charts/ExpensePieChart';

export interface CategoryTransactionsModalProps {
  visible: boolean;
  category: string | null;
  onClose: () => void;
}

export function CategoryTransactionsModal({
  visible,
  category,
  onClose,
}: CategoryTransactionsModalProps) {
  const { transactions, currentMonthTransactions } = useTransactionStore();
  const { currencySymbol } = useSettingsStore();

  const [timeScope, setTimeScope] = useState<'month' | 'all'>('month');

  // Filter transactions for this category
  const categoryTransactions = useMemo<TransactionRecord[]>(() => {
    if (!category) return [];
    const sourceList = timeScope === 'month' ? currentMonthTransactions : transactions;
    return sourceList
      .filter((t) => t.category.toLowerCase() === category.toLowerCase())
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [category, timeScope, currentMonthTransactions, transactions]);

  // Total spent in this category
  const totalAmount = useMemo(() => {
    return categoryTransactions.reduce((acc, t) => acc + t.amount, 0);
  }, [categoryTransactions]);

  // Overall total spending for this period (to compute % share)
  const periodTotalSpend = useMemo(() => {
    const sourceList = timeScope === 'month' ? currentMonthTransactions : transactions;
    return sourceList.reduce((acc, t) => acc + t.amount, 0);
  }, [timeScope, currentMonthTransactions, transactions]);

  const percentageShare = useMemo(() => {
    if (periodTotalSpend <= 0) return 0;
    return (totalAmount / periodTotalSpend) * 100;
  }, [totalAmount, periodTotalSpend]);

  if (!category) return null;

  const meta = getCategoryMeta(category);
  const catColor = getCategoryColor(category);
  const defaultExpType = meta.defaultExpenseType;

  const handleAddTransaction = () => {
    onClose();
    router.push({
      pathname: '/modals/add-transaction',
      params: { initialCategory: category },
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end bg-black/60"
      >
        <View className="max-h-[88%] rounded-t-3xl bg-white px-5 pb-8 pt-3 shadow-2xl dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
          {/* Top Grab Handle */}
          <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-gray-300 dark:bg-gray-700" />

          {/* Header Bar */}
          <View className="mb-4 flex-row items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
            <View className="flex-row items-center gap-3">
              <View
                style={{ backgroundColor: `${catColor}25` }}
                className="h-11 w-11 items-center justify-center rounded-2xl"
              >
                <Ionicons
                  name={(meta.icon as keyof typeof Ionicons.glyphMap) || 'pricetag-outline'}
                  size={22}
                  color={catColor}
                />
              </View>
              <View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {meta.label}
                  </Text>
                  <View
                    className={`rounded-full px-2 py-0.5 ${EXPENSE_TYPE_BG_COLORS[defaultExpType]}`}
                  >
                    <Text className={`text-[10px] font-bold ${EXPENSE_TYPE_COLORS[defaultExpType]}`}>
                      {EXPENSE_TYPE_LABELS[defaultExpType]}
                    </Text>
                  </View>
                </View>
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  Category Ledger Breakdown
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="rounded-full bg-gray-100 p-2 dark:bg-gray-800"
              accessibilityLabel="Close category transactions"
            >
              <Ionicons name="close" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Summary Card with Scope Switcher */}
          <View className="mb-4 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700/60">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Total {meta.label} Spends
                </Text>
                <View className="mt-1 flex-row items-baseline gap-2">
                  <CurrencyText
                    amount={totalAmount}
                    currencySymbol={currencySymbol}
                    className="text-2xl font-extrabold text-gray-900 dark:text-white"
                  />
                  {percentageShare > 0 && (
                    <View
                      style={{ backgroundColor: `${catColor}20` }}
                      className="rounded-full px-2 py-0.5"
                    >
                      <Text style={{ color: catColor }} className="text-xs font-bold">
                        {percentageShare.toFixed(1)}%
                      </Text>
                    </View>
                  )}
                </View>
                <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {categoryTransactions.length} transaction{categoryTransactions.length === 1 ? '' : 's'} recorded
                </Text>
              </View>

              {/* Time Scope Toggle */}
              <View className="flex-row rounded-xl bg-gray-200/80 p-1 dark:bg-gray-900">
                <Pressable
                  onPress={() => setTimeScope('month')}
                  className={`rounded-lg px-2.5 py-1.5 ${
                    timeScope === 'month'
                      ? 'bg-white shadow-xs dark:bg-gray-800'
                      : ''
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      timeScope === 'month'
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    This Month
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setTimeScope('all')}
                  className={`rounded-lg px-2.5 py-1.5 ${
                    timeScope === 'all'
                      ? 'bg-white shadow-xs dark:bg-gray-800'
                      : ''
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      timeScope === 'all'
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    All Time
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Transactions List */}
          {categoryTransactions.length === 0 ? (
            <View className="py-8 items-center justify-center">
              <EmptyState
                icon="receipt-outline"
                title={`No ${meta.label} transactions`}
                description={`No transactions found under ${meta.label} for ${
                  timeScope === 'month' ? 'this month' : 'all time'
                }.`}
                actionLabel={`Add ${meta.label} Expense`}
                onAction={handleAddTransaction}
              />
            </View>
          ) : (
            <FlatList
              data={categoryTransactions}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <TransactionCard item={item} deletable />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
              style={{ maxHeight: 360 }}
            />
          )}

          {/* Bottom Actions */}
          <View className="mt-3 flex-row items-center gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
            <TouchableOpacity
              onPress={handleAddTransaction}
              className="flex-1 flex-row items-center justify-center rounded-xl bg-indigo-600 py-3 shadow-sm active:bg-indigo-700"
            >
              <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
              <Text className="ml-1.5 text-sm font-bold text-white">
                Add {meta.label} Expense
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onClose}
              className="rounded-xl bg-gray-100 px-5 py-3 dark:bg-gray-800"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
