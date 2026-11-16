// ============================================================
// src/components/transactions/TransactionCard.tsx
// Individual transaction row with swipe-to-delete and tap-to-edit.
// Phase 2 — full implementation using Animated + PanResponder.
// ============================================================

import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  Animated,
  PanResponder,
  Pressable,
  TouchableHighlight,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { formatInTimeZone } from 'date-fns-tz';

import { Badge } from '@/components/ui/Badge';
import { CurrencyText } from '@/components/ui/CurrencyText';
import { TransactionRecord, Source, ExpenseType } from '@/types';
import { EXPENSE_TYPE_BG_COLORS, EXPENSE_TYPE_COLORS, IST_TIMEZONE } from '@/constants/categories';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useBudgetStore } from '@/stores/useBudgetStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

// --------------- Props ---------------

interface TransactionCardProps {
  item: TransactionRecord;
  /** Whether the card shows delete affordance (default true) */
  deletable?: boolean;
}

// --------------- Constants ---------------

const SWIPE_THRESHOLD = -72;    // px to reveal delete button
const DELETE_BTN_WIDTH = 80;    // px width of delete button area
const SCREEN_WIDTH = Dimensions.get('window').width;

// --------------- Component ---------------

export function TransactionCard({ item, deletable = true }: TransactionCardProps) {
  const { deleteTransactionFromDB } = useTransactionStore();
  const { computeDerivedValues } = useBudgetStore();
  const { currencySymbol } = useSettingsStore();

  const translateX = useRef(new Animated.Value(0)).current;
  const isDeleting = useRef(false);

  // ── Format timestamp in IST ──
  const formattedDate = formatInTimeZone(
    new Date(item.timestamp),
    IST_TIMEZONE,
    'dd MMM, hh:mm a'
  );

  // ── Source icon ──
  const sourceIcon = item.source === Source.Manual ? '✏️' : '📩';

  // ── Expense type badge colors ──
  const badgeBg = EXPENSE_TYPE_BG_COLORS[item.expenseType] ?? 'bg-gray-100';
  const badgeText = EXPENSE_TYPE_COLORS[item.expenseType] ?? 'text-gray-600';

  // ── PanResponder for swipe-to-delete ──
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture clear horizontal swipes
        return (
          deletable &&
          Math.abs(gestureState.dx) > 8 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2
        );
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow leftward swipe, clamp at -DELETE_BTN_WIDTH
        const dx = Math.min(0, Math.max(-DELETE_BTN_WIDTH, gestureState.dx));
        translateX.setValue(dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < SWIPE_THRESHOLD) {
          // Snap open to reveal delete button
          Animated.spring(translateX, {
            toValue: -DELETE_BTN_WIDTH,
            useNativeDriver: true,
            tension: 60,
            friction: 10,
          }).start();
        } else {
          // Snap back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 60,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  const handleDelete = useCallback(async () => {
    if (isDeleting.current) return;
    isDeleting.current = true;

    // Animate card out to the left before removing
    Animated.timing(translateX, {
      toValue: -SCREEN_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start(async () => {
      try {
        await deleteTransactionFromDB(item.id);
        computeDerivedValues();
      } catch (e) {
        console.error('[TransactionCard] Delete failed:', e);
        // Snap back on error
        translateX.setValue(0);
        isDeleting.current = false;
      }
    });
  }, [item.id]);

  const handleTap = useCallback(() => {
    // If the card is swiped open, close it on tap instead of navigating
    const currentVal = (translateX as any)._value;
    if (currentVal < -8) {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }).start();
      return;
    }
    router.push({ pathname: '/modals/add-transaction', params: { transactionId: item.id, editId: item.id } });
  }, [item.id]);

  return (
    <View className="mx-4 mb-3" style={{ overflow: 'hidden' }}>
      {/* ── Delete button (behind the card) ── */}
      {deletable && (
        <View
          className="absolute bottom-0 right-0 top-0 items-center justify-center rounded-2xl bg-red-500"
          style={{ width: DELETE_BTN_WIDTH }}
        >
          <TouchableHighlight
            onPress={handleDelete}
            underlayColor="#b91c1c"
            className="flex-1 w-full items-center justify-center rounded-2xl"
          >
            <Text className="text-xs font-bold text-white">🗑️{'\n'}Delete</Text>
          </TouchableHighlight>
        </View>
      )}

      {/* ── Swipeable card ── */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...(deletable ? panResponder.panHandlers : {})}
      >
        <Pressable
          onPress={handleTap}
          onLongPress={() => {
            // Long press snaps open the delete reveal
            if (!deletable) return;
            Animated.spring(translateX, {
              toValue: -DELETE_BTN_WIDTH,
              useNativeDriver: true,
              tension: 60,
              friction: 10,
            }).start();
          }}
          className="flex-row items-center rounded-2xl bg-white p-4 shadow-sm"
          style={{ elevation: 2 }}
        >
          {/* ── Left: Category badge + source icon ── */}
          <View className="mr-3 items-center gap-1">
            <Badge
              label={item.category}
              className={badgeBg}
              textClassName={badgeText}
              size="sm"
            />
            <Text className="text-xs">{sourceIcon}</Text>
          </View>

          {/* ── Center: Category + comment + date ── */}
          <View className="flex-1">
            <Text className="text-sm font-semibold text-gray-800" numberOfLines={1}>
              {item.category}
            </Text>
            {item.comments ? (
              <Text className="mt-0.5 text-xs text-gray-500" numberOfLines={1}>
                {item.comments}
              </Text>
            ) : null}
            <Text className="mt-0.5 text-xs text-gray-400">{formattedDate}</Text>
          </View>

          {/* ── Right: Amount ── */}
          <CurrencyText
            amount={item.amount}
            currencySymbol={currencySymbol}
            className="ml-2 text-sm font-bold text-red-500"
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}
