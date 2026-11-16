// ============================================================
// src/components/charts/ExpensePieChart.tsx
// Interactive Category Donut / Pie Chart for FinTrack.
// Built with pure React Native components for maximum reliability
// and zero external binary dependencies.
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';

import { Category, TransactionRecord } from '@/types';
import { CATEGORY_META, getCategoryMeta } from '@/constants/categories';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { CurrencyText } from '@/components/ui/CurrencyText';
import { CategoryTransactionsModal } from '@/components/transactions/CategoryTransactionsModal';

// --------------- Distinct Category Hex Colors ---------------

export const CATEGORY_COLORS: Record<string, string> = {
  [Category.Bills]: '#06b6d4',          // Cyan
  [Category.Food]: '#f97316',          // Orange
  [Category.Groceries]: '#10b981',     // Emerald
  [Category.Entertainment]: '#8b5cf6', // Violet
  [Category.Travel]: '#0ea5e9',        // Sky Blue
  [Category.Healthcare]: '#ef4444',    // Red
  [Category.Utilities]: '#f59e0b',     // Amber
  [Category.Shopping]: '#ec4899',      // Pink
  [Category.EMI]: '#6366f1',           // Indigo
  [Category.Rent]: '#14b8a6',          // Teal
  [Category.Other]: '#64748b',         // Slate
};

const DYNAMIC_PALETTE = [
  '#0284c7', // Sky 600
  '#d97706', // Amber 600
  '#059669', // Emerald 600
  '#7c3aed', // Violet 600
  '#db2777', // Pink 600
  '#4f46e5', // Indigo 600
  '#ca8a04', // Yellow 600
  '#0d9488', // Teal 600
];

export function getCategoryColor(cat: string): string {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  let hash = 0;
  for (let i = 0; i < cat.length; i++) {
    hash = (hash << 5) - hash + cat.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % DYNAMIC_PALETTE.length;
  return DYNAMIC_PALETTE[index];
}

// --------------- Types ---------------

export interface CategorySlice {
  category: string;
  amount: number;
  percentage: number;
  color: string;
  startPct: number;
  endPct: number;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

export interface ExpensePieChartProps {
  transactions?: TransactionRecord[];
  currencySymbol?: string;
  onSelectCategory?: (category: string | null) => void;
}

// Total number of radial segments for the donut ring
const SEGMENTS_COUNT = 64;
const CHART_SIZE = 220;
const CENTER = CHART_SIZE / 2;
const BASE_RADIUS = 80;

// --------------- Main Component ---------------

export function ExpensePieChart({
  transactions: propTransactions,
  currencySymbol: propCurrencySymbol,
  onSelectCategory,
}: ExpensePieChartProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const storeTransactions = useTransactionStore((s) => s.currentMonthTransactions);
  const storeCurrencySymbol = useSettingsStore((s) => s.currencySymbol);

  const transactions = propTransactions ?? storeTransactions;
  const currencySymbol = propCurrencySymbol ?? storeCurrencySymbol;

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [drilldownCategory, setDrilldownCategory] = useState<string | null>(null);

  const handleSelectCategory = useCallback(
    (category: string | null) => {
      const next = selectedCategory === category ? null : category;
      setSelectedCategory(next);
      if (onSelectCategory) {
        onSelectCategory(next);
      }
    },
    [selectedCategory, onSelectCategory]
  );

  // Group transactions by category and compute proportions
  const { slices, totalSpend } = useMemo(() => {
    const map = new Map<string, number>();

    for (const tx of transactions) {
      if (tx.amount > 0) {
        map.set(tx.category, (map.get(tx.category) || 0) + tx.amount);
      }
    }

    const total = Array.from(map.values()).reduce((sum, val) => sum + val, 0);

    const sortedEntries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);

    let cumulative = 0;
    const computedSlices: CategorySlice[] = [];

    for (const [cat, amt] of sortedEntries) {
      const pct = total > 0 ? (amt / total) * 100 : 0;
      const startPct = cumulative;
      cumulative += pct;
      const meta = getCategoryMeta(cat);

      computedSlices.push({
        category: cat,
        amount: amt,
        percentage: pct,
        color: getCategoryColor(cat),
        startPct,
        endPct: cumulative,
        icon: (meta.icon as keyof typeof Ionicons.glyphMap) || 'pricetag-outline',
        label: meta.label || cat,
      });
    }

    return { slices: computedSlices, totalSpend: total };
  }, [transactions]);

  // Selected slice data
  const activeSlice = useMemo(() => {
    if (!selectedCategory) return null;
    return slices.find((s) => s.category === selectedCategory) || null;
  }, [selectedCategory, slices]);

  // Pre-calculate radial segment positions and colors
  const segmentItems = useMemo(() => {
    if (totalSpend === 0 || slices.length === 0) {
      // Empty state segments
      return Array.from({ length: SEGMENTS_COUNT }).map((_, i) => {
        const angleDeg = (i / SEGMENTS_COUNT) * 360 - 90;
        const angleRad = (angleDeg * Math.PI) / 180;
        const x = CENTER + BASE_RADIUS * Math.cos(angleRad);
        const y = CENTER + BASE_RADIUS * Math.sin(angleRad);
        return {
          id: i,
          x,
          y,
          angleDeg: angleDeg + 90,
          color: '#e2e8f0', // slate-200
          opacity: 0.8,
          category: null,
          height: 14,
          width: 4,
        };
      });
    }

    return Array.from({ length: SEGMENTS_COUNT }).map((_, i) => {
      const segPct = (i / SEGMENTS_COUNT) * 100;
      // Find matching slice
      const slice =
        slices.find((s) => segPct >= s.startPct && segPct < s.endPct) ||
        slices[slices.length - 1];

      const isSelected = selectedCategory === slice?.category;
      const isAnySelected = selectedCategory !== null;

      const angleDeg = (i / SEGMENTS_COUNT) * 360 - 90;
      const angleRad = (angleDeg * Math.PI) / 180;
      const radius = isSelected ? BASE_RADIUS + 3 : BASE_RADIUS;
      const x = CENTER + radius * Math.cos(angleRad);
      const y = CENTER + radius * Math.sin(angleRad);

      let opacity = 1.0;
      if (isAnySelected && !isSelected) {
        opacity = 0.25;
      }

      return {
        id: i,
        x,
        y,
        angleDeg: angleDeg + 90,
        color: slice?.color || '#cbd5e1',
        opacity,
        category: slice?.category || null,
        height: isSelected ? 22 : 16,
        width: isSelected ? 5.5 : 4.5,
      };
    });
  }, [totalSpend, slices, selectedCategory]);

  return (
    <View className="mx-4 mb-4 rounded-3xl bg-white p-5 shadow-sm border border-gray-100 dark:bg-gray-800 dark:border-gray-700">
      {/* Header with Title and Current Selection Info */}
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Ionicons name="pie-chart" size={18} color="#4f46e5" />
          <Text className="ml-2 text-base font-bold text-gray-800 dark:text-gray-100">
            Monthly Category Split
          </Text>
        </View>
        {selectedCategory && (
          <Pressable
            onPress={() => handleSelectCategory(null)}
            className="flex-row items-center rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-700"
          >
            <Text className="text-xs font-medium text-gray-600 mr-1 dark:text-gray-300">Reset</Text>
            <Ionicons name="close-circle" size={14} color={isDark ? '#9ca3af' : '#6b7280'} />
          </Pressable>
        )}
      </View>

      {/* Donut Chart Visualizer */}
      <View className="items-center justify-center my-2">
        <View style={{ width: CHART_SIZE, height: CHART_SIZE, position: 'relative' }}>
          {/* Circular Segments Track */}
          {segmentItems.map((seg) => (
            <Pressable
              key={seg.id}
              onPress={() => seg.category && handleSelectCategory(seg.category)}
              hitSlop={6}
              style={[
                styles.segment,
                {
                  left: seg.x - seg.width / 2,
                  top: seg.y - seg.height / 2,
                  width: seg.width,
                  height: seg.height,
                  backgroundColor: seg.color,
                  opacity: seg.opacity,
                  transform: [{ rotate: `${seg.angleDeg}deg` }],
                  borderRadius: seg.width / 2,
                },
              ]}
            />
          ))}

          {/* Center Callout Hub */}
          <Pressable
            onPress={() => handleSelectCategory(null)}
            style={styles.centerHub}
            className="items-center justify-center rounded-full bg-white shadow-md border border-gray-100 dark:bg-gray-900 dark:border-gray-700"
          >
            {totalSpend === 0 ? (
              // Empty state inside hub
              <View className="items-center px-2">
                <Ionicons name="receipt-outline" size={24} color={isDark ? '#64748b' : '#94a3b8'} />
                <Text className="mt-1 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">
                  No expenses this month yet
                </Text>
              </View>
            ) : activeSlice ? (
              // Selected category inside hub
              <View className="items-center px-2">
                <View
                  style={{ backgroundColor: `${activeSlice.color}20` }}
                  className="mb-1 h-8 w-8 items-center justify-center rounded-full"
                >
                  <Ionicons name={activeSlice.icon} size={16} color={activeSlice.color} />
                </View>
                <Text
                  numberOfLines={1}
                  className="text-xs font-bold text-gray-700 dark:text-gray-200"
                >
                  {activeSlice.label}
                </Text>
                <CurrencyText
                  amount={activeSlice.amount}
                  currencySymbol={currencySymbol}
                  className="text-sm font-extrabold text-gray-900 dark:text-gray-100"
                />
                <Text
                  style={{ color: activeSlice.color }}
                  className="text-[11px] font-bold"
                >
                  {activeSlice.percentage.toFixed(1)}% of total
                </Text>
                <Pressable
                  onPress={() => setDrilldownCategory(activeSlice.category)}
                  className="mt-1.5 flex-row items-center rounded-full bg-indigo-50 px-2 py-0.5 dark:bg-indigo-950/60 active:opacity-75"
                >
                  <Text className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mr-0.5">
                    View List
                  </Text>
                  <Ionicons name="chevron-forward" size={10} color="#6366f1" />
                </Pressable>
              </View>
            ) : (
              // Default state inside hub
              <View className="items-center px-2">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Total Spend
                </Text>
                <CurrencyText
                  amount={totalSpend}
                  currencySymbol={currencySymbol}
                  className="text-base font-extrabold text-gray-900 dark:text-gray-100"
                />
                <View className="mt-1 rounded-full bg-indigo-50 px-2 py-0.5 dark:bg-indigo-950/60">
                  <Text className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                    {slices.length} {slices.length === 1 ? 'Category' : 'Categories'}
                  </Text>
                </View>
                <Text className="mt-1 text-[9px] text-gray-400">Tap to inspect</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Proportional Linear Multi-Color Stack Bar */}
      {totalSpend > 0 && (
        <View className="mt-2 mb-3">
          <View className="h-2 w-full flex-row overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            {slices.map((slice) => {
              const isSelected = selectedCategory === slice.category;
              const isAny = selectedCategory !== null;
              return (
                <Pressable
                  key={slice.category}
                  onPress={() => handleSelectCategory(slice.category)}
                  style={{
                    width: `${slice.percentage}%`,
                    backgroundColor: slice.color,
                    opacity: isAny && !isSelected ? 0.3 : 1,
                  }}
                  className="h-full"
                />
              );
            })}
          </View>
        </View>
      )}

      {/* Formatted Category Legend */}
      {totalSpend === 0 ? (
        <View className="mt-2 items-center py-2">
          <Text className="text-xs text-gray-400">
            Record expenses to see category proportions here
          </Text>
        </View>
      ) : (
        <View className="mt-1">
          <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Breakdown By Category
          </Text>

          <View className="gap-y-2">
            {slices.map((slice) => {
              const isSelected = selectedCategory === slice.category;

              return (
                <Pressable
                  key={slice.category}
                  onPress={() => {
                    handleSelectCategory(slice.category);
                    setDrilldownCategory(slice.category);
                  }}
                  style={({ pressed }) => [
                    isSelected
                      ? {
                          backgroundColor: `${slice.color}15`,
                          borderColor: slice.color,
                        }
                      : {
                          backgroundColor: isDark ? '#1f2937' : '#f8fafc',
                          borderColor: isDark ? '#374151' : '#f1f5f9',
                        },
                    { opacity: pressed ? 0.8 : 1 },
                  ]}
                  className="flex-row items-center justify-between rounded-xl border p-2.5 transition-all"
                  accessibilityLabel={`View transactions for ${slice.label}`}
                >
                  {/* Left: Icon + Category Name */}
                  <View className="flex-row items-center flex-1 pr-2">
                    <View
                      style={{ backgroundColor: `${slice.color}25` }}
                      className="mr-2.5 h-8 w-8 items-center justify-center rounded-lg"
                    >
                      <Ionicons name={slice.icon} size={16} color={slice.color} />
                    </View>
                    <View className="flex-1">
                      <Text
                        numberOfLines={1}
                        className={`text-sm ${
                          isSelected ? 'font-bold text-gray-900 dark:text-white' : 'font-medium text-gray-700 dark:text-gray-200'
                        }`}
                      >
                        {slice.label}
                      </Text>
                      {/* Mini bar for relative scale */}
                      <View className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <View
                          style={{
                            width: `${slice.percentage}%`,
                            backgroundColor: slice.color,
                          }}
                          className="h-full rounded-full"
                        />
                      </View>
                    </View>
                  </View>

                  {/* Right: Amount + Percentage Badge + Chevron */}
                  <View className="flex-row items-center gap-2">
                    <View className="items-end">
                      <CurrencyText
                        amount={slice.amount}
                        currencySymbol={currencySymbol}
                        className={`text-sm font-bold ${
                          isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-200'
                        }`}
                      />
                      <View
                        style={{ backgroundColor: `${slice.color}20` }}
                        className="mt-0.5 rounded-full px-2 py-0.5"
                      >
                        <Text
                          style={{ color: slice.color }}
                          className="text-[11px] font-bold"
                        >
                          {slice.percentage.toFixed(1)}%
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={isDark ? '#9ca3af' : '#6b7280'}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Category Transactions Drilldown Modal */}
      <CategoryTransactionsModal
        visible={drilldownCategory !== null}
        category={drilldownCategory}
        onClose={() => setDrilldownCategory(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    position: 'absolute',
  },
  centerHub: {
    position: 'absolute',
    top: CENTER - 65,
    left: CENTER - 65,
    width: 130,
    height: 130,
    elevation: 4,
  },
});
