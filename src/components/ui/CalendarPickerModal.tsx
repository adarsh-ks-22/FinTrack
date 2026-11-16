// ============================================================
// src/components/ui/CalendarPickerModal.tsx
// Offline-first, theme-aware interactive Calendar Date Picker Modal
// Built with pure React Native and date-fns (no native dependencies).
// Supports month/year navigation, quick 'Today' jump, custom title,
// min/max dates, and seamless dark mode support.
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  startOfDay,
  endOfDay,
  isBefore,
  isAfter,
} from 'date-fns';

export interface CalendarPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectDate: (date: Date) => void;
  initialDate?: Date | null;
  title?: string;
  minDate?: Date;
  maxDate?: Date;
}

const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function CalendarPickerModal({
  visible,
  onClose,
  onSelectDate,
  initialDate,
  title = 'Select Date',
  minDate,
  maxDate,
}: CalendarPickerModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => initialDate || new Date());
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    startOfMonth(initialDate || new Date())
  );

  // Sync state whenever modal opens or initialDate changes
  useEffect(() => {
    if (visible) {
      const target = initialDate && !isNaN(initialDate.getTime()) ? initialDate : new Date();
      setSelectedDate(target);
      setViewMonth(startOfMonth(target));
    }
  }, [visible, initialDate]);

  // Days in calendar view (full weeks)
  const days = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [viewMonth]);

  const handlePrevMonth = () => {
    setViewMonth((prev) => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setViewMonth((prev) => addMonths(prev, 1));
  };

  const handleJumpToToday = () => {
    const today = new Date();
    setSelectedDate(today);
    setViewMonth(startOfMonth(today));
  };

  const handleDayPress = (day: Date, isDisabled: boolean) => {
    if (isDisabled) return;
    setSelectedDate(day);
    if (!isSameMonth(day, viewMonth)) {
      setViewMonth(startOfMonth(day));
    }
  };

  const handleConfirm = () => {
    onSelectDate(selectedDate);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 items-center justify-center bg-black/60 px-5">
          <TouchableWithoutFeedback>
            <View className="w-full max-w-sm overflow-hidden rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
              {/* Header Bar */}
              <View className="mb-4 flex-row items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
                <View className="flex-row items-center gap-2">
                  <View className="h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60">
                    <Ionicons name="calendar" size={18} color="#6366f1" />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {title}
                    </Text>
                    <Text className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      {format(selectedDate, 'EEE, dd MMM yyyy')}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="rounded-full bg-gray-100 p-1.5 dark:bg-gray-800"
                >
                  <Ionicons name="close" size={16} color="#6b7280" />
                </TouchableOpacity>
              </View>

              {/* Month / Year Navigator */}
              <View className="mb-3 flex-row items-center justify-between">
                <TouchableOpacity
                  onPress={handlePrevMonth}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800"
                  hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                >
                  <Ionicons name="chevron-back" size={16} color="#4f46e5" />
                </TouchableOpacity>

                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    {format(viewMonth, 'MMMM yyyy')}
                  </Text>
                  <TouchableOpacity
                    onPress={handleJumpToToday}
                    className="rounded-full bg-indigo-50 px-2 py-0.5 dark:bg-indigo-950/50"
                  >
                    <Text className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                      Today
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={handleNextMonth}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800"
                  hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                >
                  <Ionicons name="chevron-forward" size={16} color="#4f46e5" />
                </TouchableOpacity>
              </View>

              {/* Day of Week Headers */}
              <View className="mb-1 flex-row">
                {WEEK_DAYS.map((dayName, idx) => (
                  <View key={dayName} className="flex-1 items-center py-1">
                    <Text
                      className={`text-xs font-semibold ${
                        idx === 0 || idx === 6
                          ? 'text-indigo-400 dark:text-indigo-500'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {dayName}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Days Grid */}
              <View className="flex-row flex-wrap">
                {days.map((day) => {
                  const inCurrentMonth = isSameMonth(day, viewMonth);
                  const isDaySelected = isSameDay(day, selectedDate);
                  const isCurrentDay = isToday(day);

                  const isBeforeMin = minDate ? isBefore(day, startOfDay(minDate)) : false;
                  const isAfterMax = maxDate ? isAfter(day, endOfDay(maxDate)) : false;
                  const isDisabled = isBeforeMin || isAfterMax;

                  return (
                    <View key={day.toISOString()} className="w-[14.28%] p-0.5">
                      <Pressable
                        onPress={() => handleDayPress(day, isDisabled)}
                        disabled={isDisabled}
                        className={`aspect-square items-center justify-center rounded-full ${
                          isDaySelected
                            ? 'bg-indigo-600 shadow-sm'
                            : isCurrentDay
                            ? 'border border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                            : ''
                        } ${isDisabled ? 'opacity-25' : ''}`}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            isDaySelected
                              ? 'text-white font-bold'
                              : !inCurrentMonth
                              ? 'text-gray-300 dark:text-gray-600'
                              : isCurrentDay
                              ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                              : 'text-gray-800 dark:text-gray-200'
                          }`}
                        >
                          {format(day, 'd')}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>

              {/* Footer Actions */}
              <View className="mt-4 flex-row items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                <TouchableOpacity
                  onPress={onClose}
                  className="flex-1 rounded-xl bg-gray-100 py-2.5 items-center dark:bg-gray-800"
                >
                  <Text className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConfirm}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 items-center active:bg-indigo-700 shadow-sm"
                >
                  <Text className="text-xs font-bold text-white">
                    Select Date
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
