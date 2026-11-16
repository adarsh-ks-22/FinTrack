// ============================================================
// app/(tabs)/budget.tsx
// Budget Configuration Screen — Phase 3 full implementation
// Features:
// 1. Total Monthly Budget input with currency prefix and quick-fill chips
// 2. 50/30/20 Rule Presets + Custom Stepper Controls (+/-)
// 3. Strict 100% allocation validation + auto-normalize helper
// 4. Live Summary Cards (Needs, Wants, Savings) with Over Budget warning states
// 5. WatermelonDB persistence + instant store update
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Switch,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { CurrencyText } from '@/components/ui/CurrencyText';
import { Badge } from '@/components/ui/Badge';
import { ToastNotification, showToast } from '@/components/ui/ToastNotification';
import { useBudgetStore } from '@/stores/useBudgetStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useRecurringStore } from '@/stores/useRecurringStore';
import { CATEGORY_META, getCategoryMeta } from '@/constants/categories';
import { getOrdinalSuffix } from '@/services/notificationService';

// Preset configurations
const PRESETS = [
  { id: '50/30/20', label: '50 / 30 / 20 Rule', needs: 50, wants: 30, savings: 20 },
  { id: '60/20/20', label: '60 / 20 / 20', needs: 60, wants: 20, savings: 20 },
  { id: '70/20/10', label: '70 / 20 / 10', needs: 70, wants: 20, savings: 10 },
  { id: 'custom', label: 'Custom', needs: 0, wants: 0, savings: 0 },
];

const QUICK_AMOUNTS = [15000, 25000, 50000, 75000, 100000];

export default function BudgetScreen() {
  const {
    budget,
    totalBudget: storeTotalBudget,
    needsSpent,
    wantsSpent,
    savedSoFar,
    loadBudget,
    saveBudgetToDB,
    setTotalBudget,
    setSplits,
  } = useBudgetStore();

  const { currencySymbol } = useSettingsStore();
  const { recurringPayments, toggleActiveInDB, deleteRecurringFromDB } = useRecurringStore();

  const activeRecurringCount = useMemo(
    () => recurringPayments.filter((p) => p.isActive).length,
    [recurringPayments]
  );

  const totalRecurringMonthly = useMemo(
    () =>
      recurringPayments
        .filter((p) => p.isActive)
        .reduce((sum, p) => sum + p.amount, 0),
    [recurringPayments]
  );

  const sortedRecurring = useMemo(
    () => [...recurringPayments].sort((a, b) => a.dueDay - b.dueDay),
    [recurringPayments]
  );

  const handleToggleRecurringActive = async (id: string, name: string) => {
    try {
      const newActive = await toggleActiveInDB(id);
      showToast({
        message: `${name} reminders ${newActive ? 'activated' : 'paused'}`,
        variant: newActive ? 'success' : 'info',
      });
    } catch (err) {
      showToast({ message: 'Failed to update reminder', variant: 'error' });
    }
  };

  const handleDeleteRecurring = (id: string, name: string) => {
    Alert.alert(
      'Delete Recurring Bill',
      `Are you sure you want to delete "${name}"? Upcoming notification reminders will also be cancelled.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRecurringFromDB(id);
              showToast({
                message: `Deleted "${name}"`,
                variant: 'info',
              });
            } catch (err) {
              showToast({ message: 'Failed to delete recurring bill', variant: 'error' });
            }
          },
        },
      ]
    );
  };

  // Local state for interactive editing before save
  const [amountStr, setAmountStr] = useState<string>('');
  const [needsPct, setNeedsPct] = useState<number>(50);
  const [wantsPct, setWantsPct] = useState<number>(30);
  const [savingsPct, setSavingsPct] = useState<number>(20);
  const [activePreset, setActivePreset] = useState<string>('50/30/20');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Current month formatting
  const currentMonthLabel = useMemo(() => {
    return format(new Date(), 'MMMM yyyy');
  }, []);

  // Hydrate local state from store on mount or when store budget changes
  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  useEffect(() => {
    if (budget) {
      if (budget.totalBudget > 0) {
        setAmountStr(String(budget.totalBudget));
      }
      setNeedsPct(budget.needsPct);
      setWantsPct(budget.wantsPct);
      setSavingsPct(budget.savingsPct);

      // Match preset
      const match = PRESETS.find(
        (p) =>
          p.id !== 'custom' &&
          p.needs === budget.needsPct &&
          p.wants === budget.wantsPct &&
          p.savings === budget.savingsPct
      );
      setActivePreset(match ? match.id : 'custom');
    }
  }, [budget]);

  // Sum of splits
  const splitSum = needsPct + wantsPct + savingsPct;
  const isSplitValid = splitSum === 100;

  // Numeric budget value
  const numericBudget = useMemo(() => {
    const parsed = parseFloat(amountStr.replace(/[^0-9.]/g, ''));
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }, [amountStr]);

  // Derived target limits
  const calculatedNeedsLimit = (numericBudget * needsPct) / 100;
  const calculatedWantsLimit = (numericBudget * wantsPct) / 100;
  const calculatedSavingsTarget = (numericBudget * savingsPct) / 100;

  // Apply a preset
  const handleSelectPreset = (presetId: string) => {
    setActivePreset(presetId);
    const found = PRESETS.find((p) => p.id === presetId);
    if (found && presetId !== 'custom') {
      setNeedsPct(found.needs);
      setWantsPct(found.wants);
      setSavingsPct(found.savings);
      setSplits(found.needs, found.wants, found.savings);
    }
  };

  // Adjust splits with step (+/-)
  const adjustSplit = (
    type: 'needs' | 'wants' | 'savings',
    delta: number
  ) => {
    setActivePreset('custom');
    if (type === 'needs') {
      const next = Math.max(0, Math.min(100, needsPct + delta));
      setNeedsPct(next);
      setSplits(next, wantsPct, savingsPct);
    } else if (type === 'wants') {
      const next = Math.max(0, Math.min(100, wantsPct + delta));
      setWantsPct(next);
      setSplits(needsPct, next, savingsPct);
    } else {
      const next = Math.max(0, Math.min(100, savingsPct + delta));
      setSavingsPct(next);
      setSplits(needsPct, wantsPct, next);
    }
  };

  // Normalize splits to exactly 100%
  const handleNormalize = () => {
    if (splitSum === 0) {
      setNeedsPct(50);
      setWantsPct(30);
      setSavingsPct(20);
      setActivePreset('50/30/20');
      setSplits(50, 30, 20);
      return;
    }
    const factor = 100 / splitSum;
    const n = Math.round(needsPct * factor);
    const w = Math.round(wantsPct * factor);
    const s = Math.max(0, 100 - n - w);
    setNeedsPct(n);
    setWantsPct(w);
    setSavingsPct(s);
    setSplits(n, w, s);
  };

  // Budget input change
  const handleAmountChange = (text: string) => {
    const clean = text.replace(/[^0-9]/g, '');
    setAmountStr(clean);
    const val = clean ? parseInt(clean, 10) : 0;
    setTotalBudget(val);
  };

  // Quick amount chip tap
  const handleQuickAmount = (val: number) => {
    setAmountStr(String(val));
    setTotalBudget(val);
  };

  // Save budget configuration
  const handleSaveBudget = async () => {
    if (!isSplitValid) {
      showToast({
        message: `Allocation sum is ${splitSum}%. It must strictly equal 100%.`,
        variant: 'warning',
      });
      return;
    }

    if (numericBudget <= 0) {
      showToast({
        message: 'Please enter a valid monthly budget amount greater than 0.',
        variant: 'warning',
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveBudgetToDB(numericBudget, needsPct, wantsPct, savingsPct);
      showToast({
        message: `Budget successfully saved for ${currentMonthLabel}!`,
        variant: 'success',
      });
    } catch (error) {
      console.error('[BudgetScreen] Save error:', error);
      showToast({
        message: 'Failed to save budget. Please try again.',
        variant: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ToastNotification />

      <ScreenHeader
        title="Budget Setup"
        subtitle={`${currentMonthLabel} Allocation`}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Total Monthly Budget Input Card ── */}
        <View className="mb-4 rounded-3xl bg-white p-5 shadow-sm border border-gray-100">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Total Monthly Budget
            </Text>
            <View className="rounded-full bg-indigo-50 px-2.5 py-0.5">
              <Text className="text-[11px] font-semibold text-indigo-700">
                {currentMonthLabel}
              </Text>
            </View>
          </View>

          {/* Large Numeric Input with Currency Symbol */}
          <View className="mt-3 flex-row items-center rounded-2xl bg-gray-50 px-4 py-3 border border-gray-200">
            <Text className="text-3xl font-extrabold text-indigo-600 mr-2">
              {currencySymbol}
            </Text>
            <TextInput
              value={amountStr}
              onChangeText={handleAmountChange}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              className="flex-1 text-3xl font-bold text-gray-900"
            />
            {amountStr.length > 0 && (
              <Pressable onPress={() => handleAmountChange('')} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color="#9ca3af" />
              </Pressable>
            )}
          </View>

          {/* Formatted Number Display */}
          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-xs text-gray-500">Preview:</Text>
            <CurrencyText
              amount={numericBudget}
              currencySymbol={currencySymbol}
              className="text-sm font-bold text-gray-800"
            />
          </View>

          {/* Quick Amount Suggestion Chips */}
          <View className="mt-3 flex-row flex-wrap gap-2">
            {QUICK_AMOUNTS.map((val) => (
              <Pressable
                key={val}
                onPress={() => handleQuickAmount(val)}
                className={`rounded-full px-3 py-1.5 border ${
                  numericBudget === val
                    ? 'bg-indigo-600 border-indigo-600'
                    : 'bg-gray-100 border-gray-200'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    numericBudget === val ? 'text-white' : 'text-gray-700'
                  }`}
                >
                  {currencySymbol}
                  {val.toLocaleString('en-IN')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── 2. The Split (50/30/20 Presets & Steppers) ── */}
        <View className="mb-4 rounded-3xl bg-white p-5 shadow-sm border border-gray-100">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-wider text-gray-500">
              The Split Allocation
            </Text>
            {/* Validation Badge */}
            <View
              className={`flex-row items-center rounded-full px-2.5 py-1 ${
                isSplitValid ? 'bg-emerald-50' : 'bg-amber-50'
              }`}
            >
              <Ionicons
                name={isSplitValid ? 'checkmark-circle' : 'alert-circle'}
                size={14}
                color={isSplitValid ? '#10b981' : '#f59e0b'}
              />
              <Text
                className={`ml-1 text-xs font-bold ${
                  isSplitValid ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                Sum: {splitSum}% {isSplitValid ? '✓' : '(Must be 100%)'}
              </Text>
            </View>
          </View>

          {/* Quick Presets Chips */}
          <View className="mb-4 flex-row flex-wrap gap-2">
            {PRESETS.map((p) => {
              const isSelected = activePreset === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => handleSelectPreset(p.id)}
                  className={`rounded-xl px-3.5 py-2 border ${
                    isSelected
                      ? 'bg-indigo-50 border-indigo-500'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isSelected ? 'text-indigo-700' : 'text-gray-700'
                    }`}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Split Steppers: Needs, Wants, Savings */}
          <View className="space-y-4">
            {/* Needs Stepper */}
            <View className="rounded-2xl bg-blue-50/50 border border-blue-100 p-3.5">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="mr-2 h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
                    <Text className="text-xs font-bold text-white">🏠</Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-gray-800">Needs</Text>
                    <Text className="text-[11px] text-gray-500">
                      Rent, Groceries, Utilities, Healthcare
                    </Text>
                  </View>
                </View>
                <Text className="text-base font-extrabold text-blue-600">
                  {needsPct}%
                </Text>
              </View>

              {/* Progress bar visual */}
              <View className="my-2 h-2 w-full overflow-hidden rounded-full bg-blue-100">
                <View
                  style={{ width: `${Math.min(100, needsPct)}%` }}
                  className="h-full bg-blue-500 rounded-full"
                />
              </View>

              {/* Stepper Controls */}
              <View className="flex-row items-center justify-between mt-1">
                <CurrencyText
                  amount={calculatedNeedsLimit}
                  currencySymbol={currencySymbol}
                  className="text-xs font-semibold text-blue-700"
                  prefix="Target: "
                />
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    onPress={() => adjustSplit('needs', -5)}
                    className="h-7 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs"
                  >
                    <Text className="text-xs font-bold text-gray-700">-5</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => adjustSplit('needs', -1)}
                    className="h-7 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs"
                  >
                    <Text className="text-xs font-bold text-gray-700">-1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => adjustSplit('needs', 1)}
                    className="h-7 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs"
                  >
                    <Text className="text-xs font-bold text-gray-700">+1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => adjustSplit('needs', 5)}
                    className="h-7 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs"
                  >
                    <Text className="text-xs font-bold text-gray-700">+5</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Wants Stepper */}
            <View className="rounded-2xl bg-orange-50/50 border border-orange-100 p-3.5">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="mr-2 h-7 w-7 items-center justify-center rounded-lg bg-orange-500">
                    <Text className="text-xs font-bold text-white">🎉</Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-gray-800">Wants</Text>
                    <Text className="text-[11px] text-gray-500">
                      Dining, Entertainment, Shopping, Travel
                    </Text>
                  </View>
                </View>
                <Text className="text-base font-extrabold text-orange-600">
                  {wantsPct}%
                </Text>
              </View>

              <View className="my-2 h-2 w-full overflow-hidden rounded-full bg-orange-100">
                <View
                  style={{ width: `${Math.min(100, wantsPct)}%` }}
                  className="h-full bg-orange-500 rounded-full"
                />
              </View>

              <View className="flex-row items-center justify-between mt-1">
                <CurrencyText
                  amount={calculatedWantsLimit}
                  currencySymbol={currencySymbol}
                  className="text-xs font-semibold text-orange-700"
                  prefix="Target: "
                />
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    onPress={() => adjustSplit('wants', -5)}
                    className="h-7 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs"
                  >
                    <Text className="text-xs font-bold text-gray-700">-5</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => adjustSplit('wants', -1)}
                    className="h-7 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs"
                  >
                    <Text className="text-xs font-bold text-gray-700">-1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => adjustSplit('wants', 1)}
                    className="h-7 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs"
                  >
                    <Text className="text-xs font-bold text-gray-700">+1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => adjustSplit('wants', 5)}
                    className="h-7 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs"
                  >
                    <Text className="text-xs font-bold text-gray-700">+5</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Savings Stepper */}
            <View className="rounded-2xl bg-emerald-50/50 border border-emerald-100 p-3.5">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="mr-2 h-7 w-7 items-center justify-center rounded-lg bg-emerald-500">
                    <Text className="text-xs font-bold text-white">💰</Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-gray-800">Savings</Text>
                    <Text className="text-[11px] text-gray-500">
                      Emergency Fund, Investments, Deposits
                    </Text>
                  </View>
                </View>
                <Text className="text-base font-extrabold text-emerald-600">
                  {savingsPct}%
                </Text>
              </View>

              <View className="my-2 h-2 w-full overflow-hidden rounded-full bg-emerald-100">
                <View
                  style={{ width: `${Math.min(100, savingsPct)}%` }}
                  className="h-full bg-emerald-500 rounded-full"
                />
              </View>

              <View className="flex-row items-center justify-between mt-1">
                <CurrencyText
                  amount={calculatedSavingsTarget}
                  currencySymbol={currencySymbol}
                  className="text-xs font-semibold text-emerald-700"
                  prefix="Target: "
                />
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    onPress={() => adjustSplit('savings', -5)}
                    className="h-7 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs"
                  >
                    <Text className="text-xs font-bold text-gray-700">-5</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => adjustSplit('savings', -1)}
                    className="h-7 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs"
                  >
                    <Text className="text-xs font-bold text-gray-700">-1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => adjustSplit('savings', 1)}
                    className="h-7 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs"
                  >
                    <Text className="text-xs font-bold text-gray-700">+1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => adjustSplit('savings', 5)}
                    className="h-7 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs"
                  >
                    <Text className="text-xs font-bold text-gray-700">+5</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {/* Normalization Helper Button when sum != 100 */}
          {!isSplitValid && (
            <Pressable
              onPress={handleNormalize}
              className="mt-4 flex-row items-center justify-center rounded-xl bg-amber-500 py-2.5 px-4"
            >
              <Ionicons name="refresh" size={16} color="#ffffff" />
              <Text className="ml-2 text-xs font-bold text-white">
                Auto-Normalize to 100%
              </Text>
            </Pressable>
          )}
        </View>

        {/* ── 3. Summary Cards (Needs, Wants, Savings) ── */}
        <View className="mb-4">
          <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
            Current Month Status
          </Text>

          <View className="space-y-3">
            {/* Needs Summary Card */}
            <SummaryCard
              title="Needs"
              icon="🏠"
              spent={needsSpent}
              limit={calculatedNeedsLimit}
              currencySymbol={currencySymbol}
              accentColor="#3b82f6"
            />

            {/* Wants Summary Card */}
            <SummaryCard
              title="Wants"
              icon="🎉"
              spent={wantsSpent}
              limit={calculatedWantsLimit}
              currencySymbol={currencySymbol}
              accentColor="#f97316"
            />

            {/* Savings Summary Card */}
            <SummaryCard
              title="Savings Target"
              icon="💰"
              spent={savedSoFar}
              limit={calculatedSavingsTarget}
              currencySymbol={currencySymbol}
              accentColor="#10b981"
              isSavings
            />
          </View>
        </View>

        {/* ── 4. 📅 Recurring Payments Section ── */}
        <View className="mb-6 rounded-3xl bg-white p-5 shadow-sm border border-gray-100">
          <View className="flex-row items-center justify-between mb-3">
            <View>
              <View className="flex-row items-center">
                <Text className="text-base font-extrabold text-gray-900">
                  📅 Recurring Payments
                </Text>
                {activeRecurringCount > 0 && (
                  <View className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5">
                    <Text className="text-[10px] font-bold text-emerald-700">
                      {activeRecurringCount} Active
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-xs text-gray-500 mt-0.5">
                {recurringPayments.length === 0
                  ? 'Subscriptions, rent, and monthly bills'
                  : `Total active commitment: ${currencySymbol}${totalRecurringMonthly.toLocaleString(
                      'en-IN'
                    )}/mo`}
              </Text>
            </View>

            {/* "+ Add Recurring Bill" Button */}
            <TouchableOpacity
              onPress={() => router.push('/modals/add-recurring')}
              className="flex-row items-center rounded-xl bg-indigo-600 px-3 py-2 shadow-xs active:bg-indigo-700"
            >
              <Ionicons name="add" size={16} color="#ffffff" />
              <Text className="ml-1 text-xs font-bold text-white">Add Bill</Text>
            </TouchableOpacity>
          </View>

          {/* List of Recurring Payments or Empty State */}
          {recurringPayments.length === 0 ? (
            <View className="items-center justify-center rounded-2xl bg-gray-50 py-8 px-4 border border-dashed border-gray-200">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-indigo-50 mb-2">
                <Ionicons name="calendar-outline" size={24} color="#6366f1" />
              </View>
              <Text className="text-sm font-bold text-gray-800">No Recurring Bills Yet</Text>
              <Text className="mt-1 text-center text-xs text-gray-500 max-w-[260px]">
                Add your rent, Netflix, gym, and bills to get automated reminders before due dates.
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/modals/add-recurring')}
                className="mt-3.5 flex-row items-center rounded-xl bg-indigo-50 px-4 py-2 border border-indigo-100"
              >
                <Ionicons name="add-circle-outline" size={16} color="#4f46e5" />
                <Text className="ml-1.5 text-xs font-bold text-indigo-700">
                  + Add First Recurring Bill
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="space-y-3">
              {sortedRecurring.map((item) => {
                const meta = getCategoryMeta(item.category);
                return (
                  <Pressable
                    key={item.id}
                    onPress={() =>
                      router.push({
                        pathname: '/modals/add-recurring',
                        params: { editId: item.id },
                      })
                    }
                    className="rounded-2xl bg-gray-50/70 p-3.5 border border-gray-200 active:bg-gray-100"
                  >
                    {/* Top Row: Icon, Name, Category Badges & Amount */}
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1 mr-2">
                        <View className="mr-2.5 h-9 w-9 items-center justify-center rounded-xl bg-white shadow-xs border border-gray-100">
                          <Ionicons
                            name={meta?.icon as any}
                            size={18}
                            color="#4f46e5"
                          />
                        </View>
                        <View className="flex-1">
                          <Text
                            className={`text-sm font-bold ${
                              item.isActive ? 'text-gray-900' : 'text-gray-400'
                            }`}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          <View className="flex-row items-center gap-1.5 mt-0.5">
                            <Badge
                              label={meta?.label || item.category}
                              size="sm"
                              className="bg-white border border-gray-200 px-1.5 py-0.5"
                              textClassName="text-[10px] text-gray-600 font-semibold"
                            />
                            <Badge
                              label={item.expenseType}
                              size="sm"
                              className={`px-1.5 py-0.5 ${
                                item.expenseType === 'Needs'
                                  ? 'bg-blue-100'
                                  : item.expenseType === 'Wants'
                                  ? 'bg-orange-100'
                                  : 'bg-green-100'
                              }`}
                              textClassName={`text-[10px] font-bold ${
                                item.expenseType === 'Needs'
                                  ? 'text-blue-700'
                                  : item.expenseType === 'Wants'
                                  ? 'text-orange-700'
                                  : 'text-green-700'
                              }`}
                            />
                          </View>
                        </View>
                      </View>

                      {/* Amount */}
                      <CurrencyText
                        amount={item.amount}
                        currencySymbol={currencySymbol}
                        className={`text-base font-extrabold ${
                          item.isActive ? 'text-gray-900' : 'text-gray-400'
                        }`}
                      />
                    </View>

                    {/* Bottom Row: Due Day Indicator + Active Switch + Actions */}
                    <View className="mt-3 pt-2.5 border-t border-gray-200/60 flex-row items-center justify-between">
                      <View className="flex-row items-center flex-1 mr-2">
                        <Ionicons
                          name="notifications-outline"
                          size={13}
                          color={item.isActive ? '#4f46e5' : '#9ca3af'}
                        />
                        <Text
                          className={`ml-1 text-[11px] ${
                            item.isActive ? 'text-gray-600 font-medium' : 'text-gray-400'
                          }`}
                        >
                          Due on {getOrdinalSuffix(item.dueDay)} •{' '}
                          {item.notifyDaysBefore === 0
                            ? 'Alert on due day'
                            : `Alerts ${item.notifyDaysBefore} ${
                                item.notifyDaysBefore === 1 ? 'day' : 'days'
                              } prior`}
                        </Text>
                      </View>

                      <View className="flex-row items-center gap-2">
                        {/* Quick Active Toggle */}
                        <Switch
                          value={item.isActive}
                          onValueChange={() =>
                            handleToggleRecurringActive(item.id, item.name)
                          }
                          trackColor={{ false: '#d1d5db', true: '#818cf8' }}
                          thumbColor={item.isActive ? '#4f46e5' : '#f4f3f4'}
                          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                        />

                        {/* Edit Button */}
                        <TouchableOpacity
                          onPress={() =>
                            router.push({
                              pathname: '/modals/add-recurring',
                              params: { editId: item.id },
                            })
                          }
                          className="p-1"
                          hitSlop={6}
                        >
                          <Ionicons name="pencil-outline" size={16} color="#6b7280" />
                        </TouchableOpacity>

                        {/* Delete Button */}
                        <TouchableOpacity
                          onPress={() => handleDeleteRecurring(item.id, item.name)}
                          className="p-1"
                          hitSlop={6}
                        >
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* ── 5. Save & Persist Button ── */}
        <Pressable
          onPress={handleSaveBudget}
          disabled={isSaving || !isSplitValid || numericBudget <= 0}
          className={`flex-row items-center justify-center rounded-2xl py-4 px-6 shadow-md ${
            isSaving || !isSplitValid || numericBudget <= 0
              ? 'bg-gray-300'
              : 'bg-indigo-600 active:bg-indigo-700'
          }`}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="save" size={20} color="#ffffff" />
              <Text className="ml-2 text-base font-bold text-white">
                Save Budget Configuration
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// --------------- Summary Card Component ---------------

interface SummaryCardProps {
  title: string;
  icon: string;
  spent: number;
  limit: number;
  currencySymbol: string;
  accentColor: string;
  isSavings?: boolean;
}

function SummaryCard({
  title,
  icon,
  spent,
  limit,
  currencySymbol,
  accentColor,
  isSavings = false,
}: SummaryCardProps) {
  const remaining = limit - spent;
  const consumedPct = limit > 0 ? (spent / limit) * 100 : 0;
  const isOver = !isSavings && limit > 0 && spent > limit;
  const isNear = !isSavings && limit > 0 && !isOver && consumedPct >= 80;

  // Status Badge Logic
  let statusText = 'On Track';
  let badgeBg = 'bg-emerald-50';
  let badgeText = 'text-emerald-700';
  let statusIcon: keyof typeof Ionicons.glyphMap = 'checkmark-circle';
  let cardBorder = 'border-gray-200';
  let cardBg = 'bg-white';

  if (isOver) {
    statusText = 'Over Budget';
    badgeBg = 'bg-red-100';
    badgeText = 'text-red-700';
    statusIcon = 'warning';
    cardBorder = 'border-red-400';
    cardBg = 'bg-red-50/30';
  } else if (isNear) {
    statusText = 'Near Limit';
    badgeBg = 'bg-amber-100';
    badgeText = 'text-amber-700';
    statusIcon = 'alert-circle';
    cardBorder = 'border-amber-300';
    cardBg = 'bg-amber-50/20';
  } else if (isSavings) {
    statusText = spent >= limit && limit > 0 ? 'Goal Met' : 'In Progress';
    badgeBg = spent >= limit ? 'bg-emerald-100' : 'bg-blue-50';
    badgeText = spent >= limit ? 'text-emerald-800' : 'text-blue-700';
    statusIcon = spent >= limit ? 'trophy' : 'hourglass-outline';
  }

  return (
    <View
      className={`rounded-2xl p-4 shadow-sm border ${cardBorder} ${cardBg}`}
    >
      {/* Top Header: Title + Status Badge */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Text className="mr-2 text-base">{icon}</Text>
          <Text className="text-sm font-bold text-gray-900">{title}</Text>
        </View>

        <View className={`flex-row items-center rounded-full px-2.5 py-1 ${badgeBg}`}>
          <Ionicons
            name={statusIcon}
            size={13}
            color={isOver ? '#b91c1c' : isNear ? '#b45309' : '#047857'}
          />
          <Text className={`ml-1 text-xs font-bold ${badgeText}`}>
            {statusText}
          </Text>
        </View>
      </View>

      {/* Numerical Metrics Grid */}
      <View className="mt-3 flex-row items-center justify-between">
        <View>
          <Text className="text-[11px] font-medium text-gray-400">Target Limit</Text>
          <CurrencyText
            amount={limit}
            currencySymbol={currencySymbol}
            className="text-sm font-bold text-gray-800"
          />
        </View>

        <View className="items-center">
          <Text className="text-[11px] font-medium text-gray-400">
            {isSavings ? 'Saved' : 'Current Spent'}
          </Text>
          <CurrencyText
            amount={spent}
            currencySymbol={currencySymbol}
            className={`text-sm font-bold ${isOver ? 'text-red-600' : 'text-gray-800'}`}
          />
        </View>

        <View className="items-end">
          <Text className="text-[11px] font-medium text-gray-400">
            {isOver ? 'Exceeded By' : isSavings ? 'To Goal' : 'Remaining'}
          </Text>
          <CurrencyText
            amount={Math.abs(remaining)}
            currencySymbol={currencySymbol}
            className={`text-sm font-bold ${
              isOver ? 'text-red-600' : isSavings ? 'text-emerald-600' : 'text-emerald-600'
            }`}
          />
        </View>
      </View>

      {/* Progress Bar & Percentage Consumed */}
      <View className="mt-3">
        <View className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <View
            style={{
              width: `${Math.min(100, consumedPct)}%`,
              backgroundColor: isOver ? '#ef4444' : isNear ? '#f59e0b' : accentColor,
            }}
            className="h-full rounded-full"
          />
        </View>
        <View className="mt-1 flex-row justify-between">
          <Text className="text-[10px] font-medium text-gray-500">
            {consumedPct.toFixed(1)}% {isSavings ? 'of goal achieved' : 'consumed'}
          </Text>
          {isOver && (
            <Text className="text-[10px] font-bold text-red-600">
              ⚠️ Exceeded by {currencySymbol}{(spent - limit).toLocaleString('en-IN')}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
