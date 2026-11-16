// ============================================================
// src/components/layout/ScreenHeader.tsx
// Standard screen header with title, optional subtitle,
// and optional left/right action slots.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Left action — usually a back button */
  leftAction?: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
    accessibilityLabel?: string;
  };
  /** Right action — e.g. filter, search */
  rightAction?: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
    accessibilityLabel?: string;
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
  return (
    <View
      className={`flex-row items-center justify-between border-b border-gray-100 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 ${className}`}
    >
      {/* Left action */}
      {leftAction ? (
        <TouchableOpacity
          onPress={leftAction.onPress}
          className="h-9 w-9 items-center justify-center rounded-full"
          accessibilityLabel={leftAction.accessibilityLabel}
        >
          <Ionicons name={leftAction.icon} size={22} color="#374151" />
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
          className="h-9 w-9 items-center justify-center rounded-full"
          accessibilityLabel={rightAction.accessibilityLabel}
        >
          <Ionicons name={rightAction.icon} size={22} color="#374151" />
        </TouchableOpacity>
      ) : (
        <View className="w-9" />
      )}
    </View>
  );
}
