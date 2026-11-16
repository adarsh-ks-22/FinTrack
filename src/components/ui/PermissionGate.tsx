// ============================================================
// src/components/ui/PermissionGate.tsx
// Renders children only when a given permission is granted.
// Falls back to a friendly prompt UI when not granted.
// ============================================================

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PermissionGateProps {
  /** Whether the required permission has been granted */
  granted: boolean;
  /** Icon to show in the fallback prompt */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** Title for the permission prompt */
  title: string;
  /** Description for the permission prompt */
  description: string;
  /** Label for the action button */
  actionLabel: string;
  /** Called when the user taps the action button */
  onRequestPermission: () => void;
  /** Content to render when permission is granted */
  children: React.ReactNode;
}

export function PermissionGate({
  granted,
  icon,
  title,
  description,
  actionLabel,
  onRequestPermission,
  children,
}: PermissionGateProps) {
  if (granted) {
    return <>{children}</>;
  }

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="mb-5 h-20 w-20 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900">
        <Ionicons name={icon} size={36} color="#3b82f6" />
      </View>

      <Text className="mb-2 text-center text-lg font-bold text-gray-800 dark:text-gray-100">
        {title}
      </Text>

      <Text className="mb-6 text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
        {description}
      </Text>

      <TouchableOpacity
        onPress={onRequestPermission}
        className="w-full rounded-xl bg-blue-600 py-3.5"
      >
        <Text className="text-center text-sm font-semibold text-white">{actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}
