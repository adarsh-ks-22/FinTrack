// ============================================================
// src/components/layout/ScreenHeader.tsx
// Standard screen header with title, optional subtitle,
// and optional left/right action slots.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Left action — usually a back button */
  leftAction?: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
    accessibilityLabel?: string;
  };
  /** Right action — e.g. filter, search, sync */
  rightAction?: {
    icon?: React.ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
    accessibilityLabel?: string;
    loading?: boolean;
    label?: string;
  };
  className?: string;
}

export function ScreenHeader({
  title,
  subtitle,
  leftAction,
  rightAction,
  className = '',
}: ScreenHeaderProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const defaultIconColor = isDark ? '#e5e7eb' : '#374151';

  return (
    <View
      className={`flex-row items-center justify-between border-b border-gray-100 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 ${className}`}
    >
      {/* Left action */}
      {leftAction ? (
        <TouchableOpacity
          onPress={leftAction.onPress}
          className="h-9 w-9 items-center justify-center rounded-full"
          accessibilityLabel={leftAction.accessibilityLabel}
        >
          <Ionicons name={leftAction.icon} size={22} color={defaultIconColor} />
        </TouchableOpacity>
      ) : (
        <View className="w-9" />
      )}

      {/* Title block */}
      <View className="flex-1 items-center px-2">
        <Text
          className="text-base font-bold text-gray-800 dark:text-gray-100"
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-xs text-gray-500 dark:text-gray-400" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Right action */}
      {rightAction ? (
        <TouchableOpacity
          onPress={rightAction.onPress}
          disabled={rightAction.loading}
          className="h-9 min-w-[36px] flex-row items-center justify-center rounded-full px-1"
          accessibilityLabel={rightAction.accessibilityLabel}
        >
          {rightAction.loading ? (
            <ActivityIndicator size="small" color="#6366f1" />
          ) : (
            <>
              {rightAction.icon && (
                <Ionicons name={rightAction.icon} size={22} color={defaultIconColor} />
              )}
              {rightAction.label && (
                <Text className="ml-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {rightAction.label}
                </Text>
              )}
            </>
          )}
        </TouchableOpacity>
      ) : (
        <View className="w-9" />
      )}
    </View>
  );
}
