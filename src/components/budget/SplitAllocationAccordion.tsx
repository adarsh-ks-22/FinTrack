// ============================================================
// src/components/budget/SplitAllocationAccordion.tsx
// Accordion / Collapsible component for 'The Split Allocation' section.
// Features:
// 1. Collapsed by default into a sleek, thin rectangular row.
// 2. Displays Title: "THE SPLIT ALLOCATION", "Sum: 100%" badge, and chevron icon.
// 3. Smooth animated expand/collapse on tap.
// 4. Reveals budget presets (50/30/20, etc.), progress bars,
//    target limits, +/- adjustment steppers, and auto-normalize helper.
// ============================================================

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CurrencyText } from '@/components/ui/CurrencyText';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface Preset {
  id: string;
  label: string;
  needs: number;
  wants: number;
  savings: number;
}

export interface SplitAllocationAccordionProps {
  isSplitValid: boolean;
  splitSum: number;
  activePreset: string;
  presets: Preset[];
  onSelectPreset: (presetId: string) => void;
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
  calculatedNeedsLimit: number;
  calculatedWantsLimit: number;
  calculatedSavingsTarget: number;
  currencySymbol: string;
  onAdjustSplit: (type: 'needs' | 'wants' | 'savings', delta: number) => void;
  onNormalize: () => void;
  defaultExpanded?: boolean;
}

export function SplitAllocationAccordion({
  isSplitValid,
  splitSum,
  activePreset,
  presets,
  onSelectPreset,
  needsPct,
  wantsPct,
  savingsPct,
  calculatedNeedsLimit,
  calculatedWantsLimit,
  calculatedSavingsTarget,
  currencySymbol,
  onAdjustSplit,
  onNormalize,
  defaultExpanded = false,
}: SplitAllocationAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const rotateAnim = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const nextState = !isExpanded;
    Animated.timing(rotateAnim, {
      toValue: nextState ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
    setIsExpanded(nextState);
  };

  const chevronRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View className="mb-4 overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-xs dark:bg-gray-800 dark:border-gray-700">
      {/* ── Collapsed / Accordion Header Row ── */}
      <Pressable
        onPress={toggleExpand}
        className="flex-row items-center justify-between px-4 py-3.5 active:bg-gray-50/80 dark:active:bg-gray-750"
        accessibilityRole="button"
        accessibilityLabel="The Split Allocation accordion"
        accessibilityState={{ expanded: isExpanded }}
      >
        <View className="flex-row items-center gap-2 flex-1 mr-2">
          <View className="h-6 w-6 items-center justify-center rounded-md bg-indigo-50 dark:bg-indigo-950/60">
            <Ionicons name="pie-chart-outline" size={14} color="#6366f1" />
          </View>
          <Text className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            The Split Allocation
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          {/* Validation Badge */}
          <View
            className={`flex-row items-center rounded-full px-2.5 py-1 ${
              isSplitValid
                ? 'bg-emerald-50 dark:bg-emerald-950/50'
                : 'bg-amber-50 dark:bg-amber-950/50'
            }`}
          >
            <Ionicons
              name={isSplitValid ? 'checkmark-circle' : 'alert-circle'}
              size={13}
              color={isSplitValid ? '#10b981' : '#f59e0b'}
            />
            <Text
              className={`ml-1 text-xs font-bold ${
                isSplitValid
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-amber-700 dark:text-amber-300'
              }`}
            >
              Sum: {splitSum}% {isSplitValid ? '✓' : ''}
            </Text>
          </View>

          {/* Chevron Indicator */}
          <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
            <Ionicons name="chevron-down" size={18} color="#6b7280" />
          </Animated.View>
        </View>
      </Pressable>

      {/* ── Expanded Content ── */}
      {isExpanded && (
        <View className="border-t border-gray-100 p-4 pt-3 dark:border-gray-700">
          {/* Quick Presets Chips */}
          <Text className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Rule Presets
          </Text>
          <View className="mb-4 flex-row flex-wrap gap-2">
            {presets.map((p) => {
              const isSelected = activePreset === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => onSelectPreset(p.id)}
                  className={`rounded-xl px-3.5 py-2 border ${
                    isSelected
                      ? 'bg-indigo-50 border-indigo-500 dark:bg-indigo-950/60 dark:border-indigo-400'
                      : 'bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isSelected
                        ? 'text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Split Steppers: Needs, Wants, Savings */}
          <View className="space-y-3">
            {/* Needs Stepper */}
            <View className="rounded-2xl bg-blue-50/50 border border-blue-100 p-3.5 dark:bg-blue-950/30 dark:border-blue-900/40">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="mr-2 h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
                    <Text className="text-xs font-bold text-white">🏠</Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-gray-800 dark:text-gray-100">Needs</Text>
                    <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                      Rent, Groceries, Utilities, Healthcare
                    </Text>
                  </View>
                </View>
                <Text className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                  {needsPct}%
                </Text>
              </View>

              {/* Progress bar visual */}
              <View className="my-2 h-2 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-950">
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
                  className="text-xs font-semibold text-blue-700 dark:text-blue-300"
                  prefix="Target: "
                />
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    onPress={() => onAdjustSplit('needs', -5)}
                    className="h-7 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs dark:bg-gray-700 dark:border-gray-600"
                  >
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">-5</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onAdjustSplit('needs', -1)}
                    className="h-7 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs dark:bg-gray-700 dark:border-gray-600"
                  >
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">-1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onAdjustSplit('needs', 1)}
                    className="h-7 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs dark:bg-gray-700 dark:border-gray-600"
                  >
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">+1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onAdjustSplit('needs', 5)}
                    className="h-7 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs dark:bg-gray-700 dark:border-gray-600"
                  >
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">+5</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Wants Stepper */}
            <View className="rounded-2xl bg-orange-50/50 border border-orange-100 p-3.5 dark:bg-orange-950/30 dark:border-orange-900/40">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="mr-2 h-7 w-7 items-center justify-center rounded-lg bg-orange-500">
                    <Text className="text-xs font-bold text-white">🎉</Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-gray-800 dark:text-gray-100">Wants</Text>
                    <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                      Dining, Entertainment, Shopping, Travel
                    </Text>
                  </View>
                </View>
                <Text className="text-base font-extrabold text-orange-600 dark:text-orange-400">
                  {wantsPct}%
                </Text>
              </View>

              <View className="my-2 h-2 w-full overflow-hidden rounded-full bg-orange-100 dark:bg-orange-950">
                <View
                  style={{ width: `${Math.min(100, wantsPct)}%` }}
                  className="h-full bg-orange-500 rounded-full"
                />
              </View>

              <View className="flex-row items-center justify-between mt-1">
                <CurrencyText
                  amount={calculatedWantsLimit}
                  currencySymbol={currencySymbol}
                  className="text-xs font-semibold text-orange-700 dark:text-orange-300"
                  prefix="Target: "
                />
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    onPress={() => onAdjustSplit('wants', -5)}
                    className="h-7 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs dark:bg-gray-700 dark:border-gray-600"
                  >
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">-5</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onAdjustSplit('wants', -1)}
                    className="h-7 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs dark:bg-gray-700 dark:border-gray-600"
                  >
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">-1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onAdjustSplit('wants', 1)}
                    className="h-7 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs dark:bg-gray-700 dark:border-gray-600"
                  >
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">+1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onAdjustSplit('wants', 5)}
                    className="h-7 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs dark:bg-gray-700 dark:border-gray-600"
                  >
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">+5</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Savings Stepper */}
            <View className="rounded-2xl bg-emerald-50/50 border border-emerald-100 p-3.5 dark:bg-emerald-950/30 dark:border-emerald-900/40">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="mr-2 h-7 w-7 items-center justify-center rounded-lg bg-emerald-500">
                    <Text className="text-xs font-bold text-white">💰</Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-gray-800 dark:text-gray-100">Savings</Text>
                    <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                      Emergency Fund, Investments, Deposits
                    </Text>
                  </View>
                </View>
                <Text className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                  {savingsPct}%
                </Text>
              </View>

              <View className="my-2 h-2 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950">
                <View
                  style={{ width: `${Math.min(100, savingsPct)}%` }}
                  className="h-full bg-emerald-500 rounded-full"
                />
              </View>

              <View className="flex-row items-center justify-between mt-1">
                <CurrencyText
                  amount={calculatedSavingsTarget}
                  currencySymbol={currencySymbol}
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                  prefix="Target: "
                />
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    onPress={() => onAdjustSplit('savings', -5)}
                    className="h-7 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs dark:bg-gray-700 dark:border-gray-600"
                  >
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">-5</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onAdjustSplit('savings', -1)}
                    className="h-7 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs dark:bg-gray-700 dark:border-gray-600"
                  >
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">-1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onAdjustSplit('savings', 1)}
                    className="h-7 w-8 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs dark:bg-gray-700 dark:border-gray-600"
                  >
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">+1</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onAdjustSplit('savings', 5)}
                    className="h-7 w-9 items-center justify-center rounded-lg bg-white border border-gray-200 shadow-xs dark:bg-gray-700 dark:border-gray-600"
                  >
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">+5</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {/* Normalization Helper Button when sum != 100 */}
          {!isSplitValid && (
            <Pressable
              onPress={onNormalize}
              className="mt-4 flex-row items-center justify-center rounded-xl bg-amber-500 py-2.5 px-4 active:bg-amber-600"
            >
              <Ionicons name="refresh" size={16} color="#ffffff" />
              <Text className="ml-2 text-xs font-bold text-white">
                Auto-Normalize to 100%
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
