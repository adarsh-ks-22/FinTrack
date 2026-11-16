// ============================================================
// src/components/budget/BudgetProgressBar.tsx
// Three-row budget breakdown with animated fill bars.
// Phase 2 — full implementation.
// ============================================================

import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, Pressable } from 'react-native';
import { router } from 'expo-router';

import { CurrencyText } from '@/components/ui/CurrencyText';
import { useBudgetStore } from '@/stores/useBudgetStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

// --------------- Single progress row ---------------

interface ProgressRowProps {
  label: string;
  spent: number;
  limit: number;
  currencySymbol: string;
  isSavings?: boolean;
}

function ProgressRow({ label, spent, limit, currencySymbol, isSavings = false }: ProgressRowProps) {
  const pct = limit > 0 ? Math.min(1, spent / limit) : 0;
  const fillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: pct,
      duration: 600,
      useNativeDriver: false, // width can't use native driver
    }).start();
  }, [pct]);

  const isOverBudget = !isSavings && limit > 0 && spent > limit;
  const isGoalMet = isSavings && limit > 0 && spent >= limit;

  // Color thresholds
  let fillColor = '#22c55e'; // green-500
  if (isSavings) {
    fillColor = isGoalMet ? '#10b981' : '#16a34a'; // emerald-500 / green-600
  } else {
    if (isOverBudget) fillColor = '#ef4444';       // red-500
    else if (pct >= 0.7) fillColor = '#f59e0b'; // amber-500
  }

  const widthInterpolation = fillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const amountTextColor = isSavings
    ? (isGoalMet ? 'text-emerald-600' : 'text-gray-600')
    : (isOverBudget ? 'text-red-500' : 'text-gray-600');

  return (
    <View className="mb-4">
      {/* Label + amounts */}
      <View className="mb-1.5 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-gray-700">{label}</Text>
        <View className="flex-row items-center">
          <CurrencyText
            amount={spent}
            currencySymbol={currencySymbol}
            className={`text-xs font-semibold ${amountTextColor}`}
          />
          <Text className="text-xs text-gray-400 mx-0.5"> / </Text>
          <CurrencyText
            amount={limit}
            currencySymbol={currencySymbol}
            className="text-xs text-gray-400"
          />
        </View>
      </View>

      {/* Progress bar track */}
      <View className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <Animated.View
          style={{
            height: '100%',
            width: widthInterpolation,
            backgroundColor: fillColor,
            borderRadius: 999,
          }}
        />
      </View>

      {/* Over-budget text for expenses */}
      {isOverBudget && (
        <Text className="mt-0.5 text-right text-xs font-medium text-red-500">
          Over budget by{' '}
          <CurrencyText
            amount={spent - limit}
            currencySymbol={currencySymbol}
            className="text-xs font-medium text-red-500"
          />
        </Text>
      )}

      {/* Goal met text for savings */}
      {isGoalMet && (
        <Text className="mt-0.5 text-right text-xs font-medium text-emerald-600">
          Savings goal met 🎉
        </Text>
      )}
    </View>
  );
}

// --------------- Main component ---------------

export function BudgetProgressBar() {
  const {
    budget,
    needsSpent,
    wantsSpent,
    savedSoFar,
    needsLimit,
    wantsLimit,
    savingsTarget,
  } = useBudgetStore();
  const { currencySymbol } = useSettingsStore();

  if (!budget || budget.totalBudget === 0) {
    return (
      <View className="mx-4 mb-3 rounded-2xl bg-white p-4 shadow-sm items-center">
        <Text className="text-sm text-gray-500 mb-2">No budget set for this month.</Text>
        <Pressable
          onPress={() => router.push('/(tabs)/budget')}
          className="rounded-full bg-indigo-600 px-4 py-2"
        >
          <Text className="text-sm font-semibold text-white">Set your budget →</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="mx-4 mb-3 rounded-2xl bg-white p-4 shadow-sm">
      <Text className="mb-3 text-sm font-bold text-gray-700 uppercase tracking-wide">
        Budget Breakdown
      </Text>
      <ProgressRow
        label="🏠 Needs"
        spent={needsSpent}
        limit={needsLimit}
        currencySymbol={currencySymbol}
      />
      <ProgressRow
        label="🎉 Wants"
        spent={wantsSpent}
        limit={wantsLimit}
        currencySymbol={currencySymbol}
      />
      <ProgressRow
        label="💰 Savings"
        spent={savedSoFar}
        limit={savingsTarget}
        currencySymbol={currencySymbol}
        isSavings
      />
    </View>
  );
}
