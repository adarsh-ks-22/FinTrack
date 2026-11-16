// ============================================================
// src/components/ui/EmptyState.tsx
// Generic empty state with icon, title, and description.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EmptyStateProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <View className={`items-center justify-center px-8 py-12 ${className}`}>
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
        <Ionicons name={icon} size={32} color="#9ca3af" />
      </View>

      <Text className="mb-1 text-center text-base font-semibold text-gray-700 dark:text-gray-200">
        {title}
      </Text>

      {description ? (
        <Text className="text-center text-sm text-gray-500 dark:text-gray-400">{description}</Text>
      ) : null}

      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          className="mt-4 rounded-full bg-blue-600 px-5 py-2.5"
        >
          <Text className="text-sm font-semibold text-white">{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
