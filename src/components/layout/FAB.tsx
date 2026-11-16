// ============================================================
// src/components/layout/FAB.tsx
// Floating Action Button — fixed at the bottom-right of the screen.
// ============================================================

import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface FABProps {
  /** Ionicons icon name */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  accessibilityLabel?: string;
  /** Optional additional className for positioning / color overrides */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Icon size (default: 28) */
  iconSize?: number;
  /** Icon color (default: white) */
  iconColor?: string;
}

export function FAB({
  icon,
  onPress,
  accessibilityLabel = 'Action button',
  className = '',
  disabled = false,
  iconSize = 28,
  iconColor = '#ffffff',
}: FABProps) {
  return (
    <View
      className={`absolute bottom-6 right-6 ${className}`}
      style={{ elevation: 6 }}
    >
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className={`h-14 w-14 items-center justify-center rounded-full shadow-xl ${
          disabled ? 'bg-gray-400' : 'bg-blue-600'
        }`}
        activeOpacity={0.8}
      >
        <Ionicons name={icon} size={iconSize} color={iconColor} />
      </TouchableOpacity>
    </View>
  );
}
