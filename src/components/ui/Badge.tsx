// ============================================================
// src/components/ui/Badge.tsx
// Small label badge for category tags, expense types, etc.
// ============================================================

import React from 'react';
import { View, Text } from 'react-native';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  /** Additional className for the outer View (background, padding, etc.) */
  className?: string;
  /** Additional className for the inner Text (color) */
  textClassName?: string;
  size?: 'sm' | 'md';
}

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300' },
  success: { bg: 'bg-emerald-100 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300' },
  warning: { bg: 'bg-amber-100 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-300' },
  error: { bg: 'bg-rose-100 dark:bg-rose-950', text: 'text-rose-700 dark:text-rose-300' },
  info: { bg: 'bg-blue-100 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300' },
};

export function Badge({
  label,
  variant = 'default',
  className = '',
  textClassName = '',
  size = 'sm',
}: BadgeProps) {
  const paddingClass = size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1';
  const textSizeClass = size === 'sm' ? 'text-xs' : 'text-sm';
  const variantStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.default;

  return (
    <View className={`rounded-full ${paddingClass} ${variantStyle.bg} ${className}`}>
      <Text
        className={`font-medium ${textSizeClass} ${variantStyle.text} ${textClassName}`}
      >
        {label}
      </Text>
    </View>
  );
}
