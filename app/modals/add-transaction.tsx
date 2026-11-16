// ============================================================
// app/modals/add-transaction.tsx
// Add / Edit Transaction modal — Phase 2 full implementation
// Bottom-sheet style modal with Animated slide-up, Zod validation,
// Category pill selector, ExpenseType segmented control, IST DateTime.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';
import { formatInTimeZone } from 'date-fns-tz';
import { isValid, parse, format, isAfter, startOfDay, isSameDay } from 'date-fns';

import { database } from '@/db/database';
import { Transaction } from '@/db/models/Transaction';
import { Category, ExpenseType, Source } from '@/types';
import { ALL_CATEGORIES, CATEGORY_META, IST_TIMEZONE } from '@/constants/categories';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useBudgetStore } from '@/stores/useBudgetStore';
import { CalendarPickerModal } from '@/components/ui/CalendarPickerModal';

// --------------- Zod validation schema ---------------

const transactionSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
      message: 'Amount must be a positive number greater than 0',
    }),
  category: z.string().min(1, 'Category is required'),
  expenseType: z.nativeEnum(ExpenseType, { required_error: 'Expense type is required' }),
  dateTimeStr: z
    .string()
    .min(1, 'Date and time are required')
    .refine(
      (v) => {
        const match = v.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
        if (!match) return false;
        const parsed = parse(v, 'dd/MM/yyyy HH:mm', new Date());
        return isValid(parsed);
      },
      { message: 'Enter a valid date in DD/MM/YYYY HH:mm format' }
    )
    .refine(
      (v) => {
        const match = v.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
        if (!match) return true;
        const [, day, month, year, hour, min] = match;
        const isoStr = `${year}-${month}-${day}T${hour}:${min}:00+05:30`;
        const txTime = new Date(isoStr).getTime();
        if (isNaN(txTime)) return false;
        // Do not allow future date/time (with 1-minute grace for clock skew)
        return txTime <= Date.now() + 60 * 1000;
      },
      { message: 'Future date and time cannot be selected. Please enter current or past date.' }
    ),
});

type FormErrors = Partial<Record<keyof z.infer<typeof transactionSchema>, string>>;

// --------------- Expense type config ---------------

const EXPENSE_TYPE_CONFIG: Record<
  ExpenseType,
  { label: string; activeClass: string; activeBorder: string; icon: string }
> = {
  [ExpenseType.Needs]: {
    label: 'Needs',
    activeClass: 'bg-blue-600',
    activeBorder: 'border-blue-600',
    icon: '🏠',
  },
  [ExpenseType.Wants]: {
    label: 'Wants',
    activeClass: 'bg-amber-500',
    activeBorder: 'border-amber-500',
    icon: '🎉',
  },
  [ExpenseType.Savings]: {
    label: 'Savings',
    activeClass: 'bg-green-600',
    activeBorder: 'border-green-600',
    icon: '💰',
  },
};

// --------------- Main component ---------------

export default function AddTransactionModal() {
  const { editId, transactionId, initialCategory } = useLocalSearchParams<{
    editId?: string;
    transactionId?: string;
    initialCategory?: string;
  }>();
  const activeId = transactionId || editId;
  const isEdit = !!activeId;

  const { currencySymbol } = useSettingsStore();
  const { loadTransactions } = useTransactionStore();
  const { computeDerivedValues } = useBudgetStore();

  // Form state
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>(Category.Food);
  const [customCategory, setCustomCategory] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType>(ExpenseType.Wants);
  const [dateTimeStr, setDateTimeStr] = useState('');
  const [comments, setComments] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingEdit, setIsLoadingEdit] = useState(isEdit);
  const [errors, setErrors] = useState<FormErrors>({});
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  function handleSelectCalendarDate(selectedDate: Date) {
    if (!selectedDate || isNaN(selectedDate.getTime())) {
      setShowCalendarModal(false);
      return;
    }
    const now = new Date();
    // Strictly prevent selecting any future date
    if (isAfter(startOfDay(selectedDate), startOfDay(now))) {
      setShowCalendarModal(false);
      return;
    }

    let timePart = '';
    if (dateTimeStr) {
      const parts = dateTimeStr.trim().split(/\s+/);
      if (parts.length >= 2 && /^(\d{2}):(\d{2})$/.test(parts[1])) {
        timePart = parts[1];
      }
    }
    if (!timePart) {
      try {
        timePart = formatInTimeZone(now, IST_TIMEZONE, 'HH:mm');
      } catch {
        timePart = '12:00';
      }
    }

    // If selected date is today, clamp timePart so it does not exceed current IST time
    if (isSameDay(selectedDate, now)) {
      try {
        const currentIstTime = formatInTimeZone(now, IST_TIMEZONE, 'HH:mm');
        if (timePart > currentIstTime) {
          timePart = currentIstTime;
        }
      } catch {}
    }

    try {
      const datePart = format(selectedDate, 'dd/MM/yyyy');
      setDateTimeStr(`${datePart} ${timePart}`);
    } catch (err) {
      console.warn('[AddTransaction] Failed to format selected date:', err);
    }
    if (errors.dateTimeStr) {
      setErrors((e) => ({ ...e, dateTimeStr: undefined }));
    }
    setShowCalendarModal(false);
  }

  // Slide-up bottom-sheet animation
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Set default date/time in IST
    const now = new Date();
    const istStr = formatInTimeZone(now, IST_TIMEZONE, 'dd/MM/yyyy HH:mm');
    setDateTimeStr(istStr);

    // Slide up animation
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();

    // If edit mode, load existing transaction
    if (isEdit && activeId) {
      loadExistingTransaction(activeId);
    } else if (initialCategory) {
      // Pre-select category passed from drilldown modal
      const isKnown = Object.values(Category).includes(initialCategory as Category) && initialCategory !== Category.Other;
      if (isKnown) {
        const cat = initialCategory as Category;
        setCategory(cat);
        setExpenseType(CATEGORY_META[cat]?.defaultExpenseType ?? ExpenseType.Wants);
      } else {
        setCategory(Category.Other);
        setCustomCategory(initialCategory);
      }
    }
  }, []);

  async function loadExistingTransaction(id: string) {
    try {
      const collection = database.get<Transaction>('transactions');
      const record = await collection.find(id);
      setAmount(String(record.amount));

      const isKnown = Object.values(Category).includes(record.category as Category) && record.category !== Category.Other;
      if (isKnown) {
        setCategory(record.category as Category);
        setCustomCategory('');
      } else if (record.category === Category.Other) {
        setCategory(Category.Other);
        setCustomCategory('');
      } else {
        // Custom category string (e.g., "Gym")
        setCategory(Category.Other);
        setCustomCategory(record.category);
      }

      setExpenseType(record.expenseType);
      setComments(record.comments ?? '');
      
      const rawTimestamp = Number(record.timestamp);
      let validDate: Date;
      if (!isNaN(rawTimestamp) && rawTimestamp > 0) {
        const ms = rawTimestamp < 1e11 ? rawTimestamp * 1000 : rawTimestamp;
        validDate = new Date(ms);
      } else {
        validDate = new Date();
      }
      if (isNaN(validDate.getTime()) || validDate.getTime() > Date.now()) {
        validDate = new Date();
      }
      try {
        const ist = formatInTimeZone(validDate, IST_TIMEZONE, 'dd/MM/yyyy HH:mm');
        setDateTimeStr(ist);
      } catch {
        const now = new Date();
        setDateTimeStr(formatInTimeZone(now, IST_TIMEZONE, 'dd/MM/yyyy HH:mm'));
      }
    } catch (e) {
      console.error('[AddTransaction] Failed to load transaction for edit:', e);
    } finally {
      setIsLoadingEdit(false);
    }
  }

  function getEffectiveCategory(): string {
    if (category === Category.Other && customCategory.trim().length > 0) {
      return customCategory.trim();
    }
    return category;
  }

  function validate(): boolean {
    const effectiveCategory = getEffectiveCategory();
    const result = transactionSchema.safeParse({
      amount,
      category: effectiveCategory,
      expenseType,
      dateTimeStr,
    });
    if (!result.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof FormErrors;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return false;
    }
    setErrors({});
    return true;
  }

  // Parse IST DD/MM/YYYY HH:mm into UTC timestamp
  function parseIstToUtcTimestamp(str: string): number {
    const match = str.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (match) {
      const [, day, month, year, hour, min] = match;
      const isoStr = `${year}-${month}-${day}T${hour}:${min}:00+05:30`;
      const ts = new Date(isoStr).getTime();
      if (!isNaN(ts)) return ts;
    }
    // Fallback
    try {
      const parsed = parse(str, 'dd/MM/yyyy HH:mm', new Date());
      if (isValid(parsed) && !isNaN(parsed.getTime())) {
        return parsed.getTime() - 5.5 * 60 * 60 * 1000;
      }
    } catch {}
    return Date.now();
  }

  async function handleSave() {
    if (!validate()) return;

    const parsedAmount = parseFloat(amount);
    const utcTimestamp = parseIstToUtcTimestamp(dateTimeStr);
    const effectiveCategory = getEffectiveCategory();

    if (utcTimestamp > Date.now() + 60 * 1000) {
      setErrors((e) => ({
        ...e,
        dateTimeStr: 'Future date and time cannot be selected. Please enter current or past date.',
      }));
      return;
    }

    try {
      setIsSaving(true);
      const collection = database.get<Transaction>('transactions');

      await database.write(async () => {
        if (isEdit && activeId) {
          const record = await collection.find(activeId);
          await record.update((t) => {
            t.amount = parsedAmount;
            t.category = effectiveCategory;
            t.expenseType = expenseType;
            t.comments = comments.trim() ? comments.trim() : null;
            t.timestamp = utcTimestamp;
          });
        } else {
          await collection.create((t) => {
            t.amount = parsedAmount;
            t.category = effectiveCategory;
            t.expenseType = expenseType;
            t.source = Source.Manual;
            t.comments = comments.trim() ? comments.trim() : null;
            t.timestamp = utcTimestamp;
          });
        }
      });

      // Refresh store and recompute budget derived values
      await loadTransactions();
      computeDerivedValues();

      router.back();
    } catch (error) {
      console.error('[AddTransaction] Save failed:', error);
      setErrors({ amount: 'Failed to save transaction. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoadingEdit) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-gray-50 dark:bg-gray-950" edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color="#4f46e5" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={8}
      >
        <Animated.View
          style={{
            flex: 1,
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [200, 0],
                }),
              },
            ],
          }}
        >
          {/* ── Bottom-sheet drag pill ── */}
          <View className="items-center pt-2 pb-1 bg-white dark:bg-gray-900">
            <View className="h-1.5 w-12 rounded-full bg-gray-300 dark:bg-gray-700" />
          </View>

          {/* ── Header ── */}
          <View className="flex-row items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900">
            <TouchableOpacity onPress={() => router.back()} className="p-1">
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
            <Text className="text-base font-semibold text-gray-800 dark:text-gray-100">
              {isEdit ? 'Edit Transaction' : 'Add Transaction'}
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={isSaving}
              className={`rounded-lg px-4 py-2 ${isSaving ? 'bg-indigo-400' : 'bg-indigo-600'}`}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text className="text-sm font-semibold text-white">Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            className="flex-1 px-4 pt-4"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {/* ── Amount Input ── */}
            <View className="mb-5">
              <Text className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Amount ({currencySymbol})
              </Text>
              <View
                className={`flex-row items-center rounded-xl bg-white px-4 shadow-sm dark:bg-gray-800 ${
                  errors.amount ? 'border border-red-500' : 'border border-gray-200 dark:border-gray-700'
                }`}
              >
                <Text className="text-xl font-bold text-gray-400 mr-1">{currencySymbol}</Text>
                <TextInput
                  value={amount}
                  onChangeText={(v) => {
                    setAmount(v);
                    if (errors.amount) setErrors((e) => ({ ...e, amount: undefined }));
                  }}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  className="flex-1 py-3.5 text-2xl font-bold text-gray-800 dark:text-gray-100"
                  placeholderTextColor="#9ca3af"
                  returnKeyType="done"
                />
              </View>
              {errors.amount ? (
                <Text className="mt-1 text-xs text-red-500">{errors.amount}</Text>
              ) : null}
            </View>

            {/* ── Category Picker ── */}
            <View className="mb-5">
              <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Category
              </Text>
              {errors.category ? (
                <Text className="mb-1 text-xs text-red-500">{errors.category}</Text>
              ) : null}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
              >
                {ALL_CATEGORIES.map((cat) => {
                  const meta = CATEGORY_META[cat];
                  const isSelected = cat === category;
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => {
                        setCategory(cat);
                        if (cat !== Category.Other) {
                          setCustomCategory('');
                        }
                        setExpenseType(meta.defaultExpenseType);
                        setErrors((e) => ({ ...e, category: undefined }));
                      }}
                      className={`rounded-full border px-3.5 py-2 ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-600'
                          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          isSelected ? 'text-white' : 'text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {meta.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* ── Custom Category Input (shown when 'Other' is selected) ── */}
              {category === Category.Other && (
                <View className="mt-3 rounded-2xl bg-indigo-50/70 p-3.5 border border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-900/60">
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                      Specify Category Name
                    </Text>
                    <Text className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                      {customCategory.trim() ? `Tracked as "${customCategory.trim()}"` : 'Custom label'}
                    </Text>
                  </View>
                  <View className="flex-row items-center rounded-xl bg-white px-3.5 border border-indigo-200 dark:bg-gray-800 dark:border-gray-700">
                    <Ionicons name="pricetag-outline" size={16} color="#6366f1" />
                    <TextInput
                      value={customCategory}
                      onChangeText={(v) => {
                        setCustomCategory(v);
                        if (errors.category) setErrors((e) => ({ ...e, category: undefined }));
                      }}
                      placeholder="e.g. Gym, Pet Care, Insurance, Education..."
                      placeholderTextColor="#9ca3af"
                      className="ml-2 flex-1 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100"
                      returnKeyType="done"
                      maxLength={30}
                    />
                    {customCategory.trim().length > 0 && (
                      <Pressable onPress={() => setCustomCategory('')} className="p-1">
                        <Ionicons name="close-circle" size={16} color="#9ca3af" />
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </View>

            {/* ── Expense Type Segmented Control ── */}
            <View className="mb-5">
              <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Expense Type
              </Text>
              {errors.expenseType ? (
                <Text className="mb-1 text-xs text-red-500">{errors.expenseType}</Text>
              ) : null}
              <View className="flex-row gap-2">
                {Object.values(ExpenseType).map((et) => {
                  const cfg = EXPENSE_TYPE_CONFIG[et];
                  const isSelected = et === expenseType;
                  return (
                    <Pressable
                      key={et}
                      onPress={() => {
                        setExpenseType(et);
                        setErrors((e) => ({ ...e, expenseType: undefined }));
                      }}
                      className={`flex-1 items-center rounded-xl border py-3 ${
                        isSelected
                          ? `${cfg.activeClass} ${cfg.activeBorder}`
                          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                      }`}
                    >
                      <Text className="text-base">{cfg.icon}</Text>
                      <Text
                        className={`mt-0.5 text-xs font-semibold ${
                          isSelected ? 'text-white' : 'text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {cfg.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* ── Date & Time Input ── */}
            <View className="mb-5">
              <View className="mb-1.5 flex-row items-center justify-between">
                <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  Date &amp; Time (IST)
                </Text>
                <TouchableOpacity
                  onPress={() => setShowCalendarModal(true)}
                  className="flex-row items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 dark:bg-indigo-950/60"
                  activeOpacity={0.7}
                  accessibilityLabel="Open calendar to pick date"
                >
                  <Ionicons name="calendar" size={13} color="#6366f1" />
                  <Text className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    Pick Date
                  </Text>
                </TouchableOpacity>
              </View>
              <View
                className={`flex-row items-center rounded-xl bg-white px-4 shadow-sm dark:bg-gray-800 ${
                  errors.dateTimeStr ? 'border border-red-500' : 'border border-gray-200 dark:border-gray-700'
                }`}
              >
                <TouchableOpacity
                  onPress={() => setShowCalendarModal(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  className="p-1 mr-1"
                  accessibilityLabel="Open calendar date picker"
                >
                  <Ionicons name="calendar-outline" size={20} color="#6366f1" />
                </TouchableOpacity>
                <TextInput
                  value={dateTimeStr}
                  onChangeText={(v) => {
                    setDateTimeStr(v);
                    if (errors.dateTimeStr) setErrors((e) => ({ ...e, dateTimeStr: undefined }));
                  }}
                  placeholder="DD/MM/YYYY HH:mm"
                  className="flex-1 py-3.5 text-sm text-gray-800 dark:text-gray-100"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numbers-and-punctuation"
                  maxLength={16}
                  returnKeyType="done"
                />
              </View>
              {errors.dateTimeStr ? (
                <Text className="mt-1 text-xs text-red-500">{errors.dateTimeStr}</Text>
              ) : (
                <Text className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Format: DD/MM/YYYY HH:mm (current or past) • Tap calendar icon to pick date
                </Text>
              )}
            </View>

            {/* ── Comment / Note ── */}
            <View className="mb-5">
              <Text className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Note (optional)
              </Text>
              <TextInput
                value={comments}
                onChangeText={setComments}
                placeholder="Add a note…"
                multiline
                numberOfLines={3}
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                placeholderTextColor="#9ca3af"
                textAlignVertical="top"
                style={{ minHeight: 72 }}
              />
            </View>

            {/* ── Source indicator ── */}
            <View className="mb-2 flex-row items-center">
              <Ionicons name="pencil-outline" size={14} color="#9ca3af" />
              <Text className="ml-1 text-xs text-gray-400">Source: Manual entry</Text>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      <CalendarPickerModal
        visible={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        onSelectDate={handleSelectCalendarDate}
        title="Select Transaction Date"
        maxDate={new Date()}
        initialDate={(() => {
          if (dateTimeStr) {
            const dateOnly = dateTimeStr.trim().split(/\s+/)[0];
            try {
              const parsed = parse(dateOnly, 'dd/MM/yyyy', new Date());
              if (isValid(parsed) && !isNaN(parsed.getTime())) {
                return isAfter(parsed, new Date()) ? new Date() : parsed;
              }
            } catch {}
          }
          return new Date();
        })()}
      />
    </SafeAreaView>
  );
}
