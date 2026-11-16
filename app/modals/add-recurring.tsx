// ============================================================
// app/modals/add-recurring.tsx
// Add / Edit Recurring Payment Modal — Phase 5 Full Implementation
// Bottom-sheet modal with Animated slide-up, Zod validation,
// Category pill selector, ExpenseType segmented control, Due Day picker
// (1–31) with month-end clamp note, Alert Days selector, and Active toggle.
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
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';

import { database } from '@/db/database';
import { RecurringPayment } from '@/db/models/RecurringPayment';
import { Category, ExpenseType } from '@/types';
import { ALL_CATEGORIES, CATEGORY_META } from '@/constants/categories';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useRecurringStore } from '@/stores/useRecurringStore';
import { showToast } from '@/components/ui/ToastNotification';
import { getOrdinalSuffix } from '@/services/notificationService';

// --------------- Zod Schema ---------------

const recurringSchema = z.object({
  name: z.string().trim().min(1, 'Payment name is required'),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, {
      message: 'Amount must be greater than 0',
    }),
  category: z.string().min(1, 'Category is required'),
  expenseType: z.nativeEnum(ExpenseType, { required_error: 'Expense type is required' }),
  dueDay: z
    .number()
    .min(1, 'Due day must be between 1 and 31')
    .max(31, 'Due day must be between 1 and 31'),
  notifyDaysBefore: z
    .number()
    .min(0, 'Notify days must be at least 0')
    .max(30, 'Notify days must be 30 or less'),
  isActive: z.boolean(),
});

type FormErrors = Partial<Record<'name' | 'amount' | 'dueDay' | 'notifyDaysBefore', string>>;

// Quick Presets
const SUGGESTED_NAMES = [
  'House Rent',
  'Netflix',
  'Broadband',
  'Gym Membership',
  'Electricity Bill',
  'Mobile Recharge',
  'Health Insurance',
  'Car EMI',
];

const NOTIFY_DAYS_PRESETS = [1, 2, 3, 5];

const EXPENSE_TYPE_CONFIG: Record<
  ExpenseType,
  { label: string; activeClass: string; icon: string }
> = {
  [ExpenseType.Needs]: {
    label: 'Needs',
    activeClass: 'bg-blue-600',
    icon: '🏠',
  },
  [ExpenseType.Wants]: {
    label: 'Wants',
    activeClass: 'bg-amber-500',
    icon: '🎉',
  },
  [ExpenseType.Savings]: {
    label: 'Savings',
    activeClass: 'bg-green-600',
    icon: '💰',
  },
};

export default function AddRecurringModal() {
  const { id, recurringId, editId } = useLocalSearchParams<{
    id?: string;
    recurringId?: string;
    editId?: string;
  }>();

  const activeId = id || recurringId || editId;
  const isEdit = !!activeId;

  const { currencySymbol } = useSettingsStore();
  const { addRecurringToDB, updateRecurringInDB, recurringPayments } = useRecurringStore();

  // Form states
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>(Category.EMI);
  const [customCategory, setCustomCategory] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType>(ExpenseType.Needs);
  const [dueDay, setDueDay] = useState<number>(5);
  const [notifyDaysBefore, setNotifyDaysBefore] = useState<number>(2);
  const [isActive, setIsActive] = useState<boolean>(true);

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingRecord, setIsLoadingRecord] = useState(isEdit);

  // Bottom-sheet slide animation
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slide up
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();

    if (isEdit && activeId) {
      loadExisting(activeId);
    }
  }, []);

  const loadExisting = async (targetId: string) => {
    try {
      // Check store first
      const found = recurringPayments.find((p) => p.id === targetId);
      const rec = found || (await database.get<RecurringPayment>('recurring_payments').find(targetId));
      if (rec) {
        setName(rec.name);
        setAmount(String(rec.amount));
        const recCategory = rec.category as string;
        if (ALL_CATEGORIES.includes(recCategory as Category) && recCategory !== Category.Other) {
          setCategory(recCategory as Category);
          setCustomCategory('');
        } else if (recCategory === Category.Other) {
          setCategory(Category.Other);
          setCustomCategory('');
        } else {
          setCategory(Category.Other);
          setCustomCategory(recCategory || '');
        }
        setExpenseType(rec.expenseType);
        setDueDay(rec.dueDay);
        setNotifyDaysBefore(rec.notifyDaysBefore);
        setIsActive(rec.isActive);
      }
    } catch (e) {
      console.error('[AddRecurringModal] Error loading existing payment:', e);
      showToast({ message: 'Failed to load recurring payment', variant: 'error' });
    } finally {
      setIsLoadingRecord(false);
    }
  };

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      router.back();
    });
  };

  const handleSelectCategory = (cat: Category) => {
    setCategory(cat);
    if (cat !== Category.Other) {
      setCustomCategory('');
    }
    const meta = CATEGORY_META[cat];
    if (meta?.defaultExpenseType) {
      setExpenseType(meta.defaultExpenseType);
    }
  };

  const getEffectiveCategory = (): string => {
    if (category === Category.Other && customCategory.trim().length > 0) {
      return customCategory.trim();
    }
    return category;
  };

  const handleSave = async () => {
    const effectiveCategory = getEffectiveCategory();

    // Validate with Zod
    const result = recurringSchema.safeParse({
      name,
      amount,
      category: effectiveCategory,
      expenseType,
      dueDay,
      notifyDaysBefore,
      isActive,
    });

    if (!result.success) {
      const fieldErrors: FormErrors = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof FormErrors;
        if (field) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      showToast({
        message: result.error.errors[0]?.message || 'Please fill required fields correctly',
        variant: 'warning',
      });
      return;
    }

    setErrors({});
    setIsSaving(true);

    try {
      const parsedAmount = parseFloat(amount);

      if (isEdit && activeId) {
        await updateRecurringInDB(activeId, {
          name: name.trim(),
          amount: parsedAmount,
          category: effectiveCategory,
          expenseType,
          dueDay,
          notifyDaysBefore,
          isActive,
        });
        showToast({
          message: `Updated "${name.trim()}" successfully!`,
          variant: 'success',
        });
      } else {
        await addRecurringToDB({
          name: name.trim(),
          amount: parsedAmount,
          category: effectiveCategory,
          expenseType,
          dueDay,
          notifyDaysBefore,
          isActive,
        });
        showToast({
          message: `Added "${name.trim()}" to recurring payments!`,
          variant: 'success',
        });
      }

      handleClose();
    } catch (err) {
      console.error('[AddRecurringModal] Save error:', err);
      showToast({
        message: 'Could not save recurring payment. Please try again.',
        variant: 'error',
      });
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-black/50" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end"
      >
        {/* Backdrop press to dismiss */}
        <Pressable className="flex-1" onPress={handleClose} />

        {/* Animated Bottom-Sheet Card */}
        <Animated.View
          style={{
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [600, 0],
                }),
              },
            ],
          }}
          className="max-h-[92%] rounded-t-3xl bg-white shadow-2xl border-t border-gray-100 dark:bg-gray-800 dark:border-gray-700"
        >
          {/* Header Bar */}
          <View className="flex-row items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <View className="flex-row items-center">
              <View className="mr-2.5 h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60">
                <Ionicons
                  name={isEdit ? 'create-outline' : 'repeat-outline'}
                  size={18}
                  color="#4f46e5"
                />
              </View>
              <Text className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {isEdit ? 'Edit Recurring Bill' : 'New Recurring Bill'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleClose}
              className="h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
            >
              <Ionicons name="close" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {isLoadingRecord ? (
            <View className="h-64 items-center justify-center">
              <ActivityIndicator size="large" color="#4f46e5" />
            </View>
          ) : (
            <ScrollView
              className="px-5 pt-3"
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* 1. Payment Name */}
              <View className="mb-4">
                <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Bill / Subscription Name <Text className="text-red-500">*</Text>
                </Text>
                <View
                  className={`flex-row items-center rounded-2xl bg-gray-50 px-3.5 py-3 border dark:bg-gray-700/60 ${
                    errors.name ? 'border-red-400 bg-red-50/20' : 'border-gray-200 dark:border-gray-600'
                  }`}
                >
                  <Ionicons name="card-outline" size={18} color="#6b7280" style={{ marginRight: 4 }} />
                  <TextInput
                    value={name}
                    onChangeText={(t) => {
                      setName(t);
                      if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    placeholder="e.g. Netflix, House Rent, Gym"
                    placeholderTextColor="#9ca3af"
                    className="flex-1 ml-2 text-sm font-semibold text-gray-900 dark:text-white"
                  />
                  {name.length > 0 && (
                    <TouchableOpacity onPress={() => setName('')} hitSlop={6}>
                      <Ionicons name="close-circle" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                </View>
                {errors.name && (
                  <Text className="mt-1 text-xs text-red-500 font-medium">{errors.name}</Text>
                )}

                {/* Quick Suggestion Chips */}
                {!isEdit && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="mt-2"
                    contentContainerStyle={{ gap: 6 }}
                  >
                    {SUGGESTED_NAMES.map((suggested) => (
                      <TouchableOpacity
                        key={suggested}
                        onPress={() => setName(suggested)}
                        className={`rounded-full px-2.5 py-1 border ${
                          name === suggested
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'bg-gray-100 border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                        }`}
                      >
                        <Text
                          className={`text-[11px] font-semibold ${
                            name === suggested ? 'text-white' : 'text-gray-600 dark:text-gray-200'
                          }`}
                        >
                          {suggested}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* 2. Amount Input with Active Currency Prefix */}
              <View className="mb-4">
                <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Amount <Text className="text-red-500">*</Text>
                </Text>
                <View
                  className={`flex-row items-center rounded-2xl bg-gray-50 px-4 py-3 border dark:bg-gray-700/60 ${
                    errors.amount ? 'border-red-400 bg-red-50/20' : 'border-gray-200 dark:border-gray-600'
                  }`}
                >
                  <Text className="text-2xl font-extrabold text-indigo-600 mr-2 dark:text-indigo-400">
                    {currencySymbol}
                  </Text>
                  <TextInput
                    value={amount}
                    onChangeText={(t) => {
                      const clean = t.replace(/[^0-9.]/g, '');
                      setAmount(clean);
                      if (errors.amount) setErrors((prev) => ({ ...prev, amount: undefined }));
                    }}
                    placeholder="0.00"
                    placeholderTextColor="#9ca3af"
                    keyboardType="decimal-pad"
                    className="flex-1 text-2xl font-bold text-gray-900 dark:text-white"
                  />
                  {amount.length > 0 && (
                    <TouchableOpacity onPress={() => setAmount('')} hitSlop={6}>
                      <Ionicons name="close-circle" size={18} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                </View>
                {errors.amount && (
                  <Text className="mt-1 text-xs text-red-500 font-medium">{errors.amount}</Text>
                )}
              </View>

              {/* 3. Category Selector */}
              <View className="mb-4">
                <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                  Category
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {ALL_CATEGORIES.map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const isSelected = category === cat;
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => handleSelectCategory(cat)}
                        className={`flex-row items-center rounded-xl px-3 py-2 border ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                        }`}
                      >
                        <Ionicons
                          name={meta.icon as any}
                          size={14}
                          color={isSelected ? '#ffffff' : '#6b7280'}
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          className={`text-xs font-semibold ml-1 ${
                            isSelected ? 'text-white' : 'text-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {meta.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Custom Category Input if 'Other' is selected */}
                {category === Category.Other && (
                  <View className="mt-3">
                    <Text className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">
                      Custom Category Name{' '}
                      <Text className="text-gray-400 font-normal">
                        ({customCategory.trim() ? `Tracked as "${customCategory.trim()}"` : 'Optional'})
                      </Text>
                    </Text>
                    <View className="flex-row items-center rounded-2xl bg-gray-50 px-3.5 py-3 border border-indigo-200">
                      <Ionicons name="pricetag-outline" size={18} color="#4f46e5" style={{ marginRight: 4 }} />
                      <TextInput
                        value={customCategory}
                        onChangeText={setCustomCategory}
                        placeholder="e.g. Gym, Subscriptions, Pet Care"
                        placeholderTextColor="#9ca3af"
                        className="flex-1 ml-2 text-sm font-semibold text-gray-900"
                        autoCapitalize="words"
                      />
                      {customCategory.trim().length > 0 && (
                        <TouchableOpacity onPress={() => setCustomCategory('')} hitSlop={6}>
                          <Ionicons name="close-circle" size={16} color="#9ca3af" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              </View>

              {/* 4. Expense Type Picker (Needs / Wants / Savings) */}
              <View className="mb-4">
                <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                  Budget Classification
                </Text>
                <View className="flex-row gap-2 rounded-2xl bg-gray-100 p-1">
                  {Object.values(ExpenseType).map((et) => {
                    const isSelected = expenseType === et;
                    const cfg = EXPENSE_TYPE_CONFIG[et];
                    return (
                      <Pressable
                        key={et}
                        onPress={() => setExpenseType(et)}
                        className={`flex-1 flex-row items-center justify-center rounded-xl py-2.5 ${
                          isSelected ? cfg.activeClass : 'bg-transparent'
                        }`}
                      >
                        <Text className="mr-1.5 text-xs">{cfg.icon}</Text>
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? 'text-white' : 'text-gray-700'
                          }`}
                        >
                          {cfg.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 5. Due Day Picker (1 to 31) with Month-end Clamping Note */}
              <View className="mb-4 rounded-2xl bg-gray-50 p-3.5 border border-gray-200 dark:bg-gray-700/60 dark:border-gray-600">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Day of Month Due
                  </Text>
                  <View className="flex-row items-center rounded-full bg-indigo-100 px-3 py-1 dark:bg-indigo-950/60">
                    <Ionicons name="calendar-outline" size={13} color="#4f46e5" />
                    <Text className="ml-1 text-xs font-extrabold text-indigo-700 dark:text-indigo-300">
                      {getOrdinalSuffix(dueDay)} of every month
                    </Text>
                  </View>
                </View>

                {/* Day selector horizontal scroll */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                    const isSelected = dueDay === d;
                    return (
                      <Pressable
                        key={d}
                        onPress={() => setDueDay(d)}
                        className={`h-9 w-9 items-center justify-center rounded-xl border ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'bg-white border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? 'text-white' : 'text-gray-800 dark:text-gray-200'
                          }`}
                        >
                          {d}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Month-End Clamping Helper Notice */}
                <View className="mt-2 flex-row items-start rounded-xl bg-blue-50/70 p-2.5 border border-blue-100 dark:bg-blue-950/40 dark:border-blue-900/60">
                  <Ionicons
                    name="information-circle-outline"
                    size={16}
                    color="#2563eb"
                    style={{ marginRight: 4, marginTop: 2 }}
                  />
                  <Text className="ml-1 flex-1 text-[11px] leading-4 text-blue-800 dark:text-blue-300">
                    <Text className="font-bold">Clamped for short months:</Text> If set to day 29,
                    30, or 31, reminders and due dates automatically adjust to the final day of
                    shorter months (e.g. Feb 28/29, Apr 30).
                  </Text>
                </View>
              </View>

              {/* 6. Notify Days Before Selector */}
              <View className="mb-4 rounded-2xl bg-gray-50 p-3.5 border border-gray-200 dark:bg-gray-700/60 dark:border-gray-600">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Reminder Alerts
                  </Text>
                  <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">
                    {notifyDaysBefore === 0
                      ? 'Alert on due day'
                      : `Alert ${notifyDaysBefore} ${
                          notifyDaysBefore === 1 ? 'day' : 'days'
                        } prior (9:00 AM)`}
                  </Text>
                </View>

                {/* Quick Presets: 1, 2, 3, 5 days */}
                <View className="flex-row gap-2">
                  {NOTIFY_DAYS_PRESETS.map((days) => {
                    const isSelected = notifyDaysBefore === days;
                    return (
                      <Pressable
                        key={days}
                        onPress={() => setNotifyDaysBefore(days)}
                        className={`flex-1 items-center justify-center rounded-xl py-2.5 border ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600'
                            : 'bg-white border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? 'text-white' : 'text-gray-700 dark:text-gray-200'
                          }`}
                        >
                          {days} {days === 1 ? 'day' : 'days'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* 7. Active Toggle Switch */}
              <View className="mb-6 flex-row items-center justify-between rounded-2xl bg-gray-50 p-4 border border-gray-200 dark:bg-gray-700/60 dark:border-gray-600">
                <View className="flex-1 pr-3">
                  <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Active Reminder Notifications
                  </Text>
                  <Text className="text-xs text-gray-500 mt-0.5 dark:text-gray-400">
                    Schedule automated push notifications at 9:00 AM IST before each due date.
                  </Text>
                </View>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ false: '#d1d5db', true: '#818cf8' }}
                  thumbColor={isActive ? '#4f46e5' : '#f4f3f4'}
                />
              </View>

              {/* 8. Save & Cancel Buttons */}
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={handleClose}
                  disabled={isSaving}
                  className="flex-1 items-center justify-center rounded-2xl bg-gray-100 py-3.5"
                >
                  <Text className="text-sm font-bold text-gray-700">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSave}
                  disabled={isSaving}
                  className="flex-2 flex-row items-center justify-center rounded-2xl bg-indigo-600 py-3.5 px-6 shadow-md active:bg-indigo-700"
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons
                        name={isEdit ? 'checkmark-done' : 'add-circle-outline'}
                        size={18}
                        color="#ffffff"
                      />
                      <Text className="ml-2 text-sm font-bold text-white">
                        {isEdit ? 'Update Bill' : 'Save Recurring Bill'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
