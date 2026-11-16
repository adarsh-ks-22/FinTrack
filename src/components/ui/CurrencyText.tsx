// ============================================================
// src/components/ui/CurrencyText.tsx
// Formats a number as a currency string with the user's symbol.
// Dynamically reactive to useSettingsStore global currency.
// ============================================================

import React from 'react';
import { Text, TextProps } from 'react-native';
import { useSettingsStore } from '@/stores/useSettingsStore';

interface CurrencyTextProps extends Omit<TextProps, 'children'> {
  amount: number;
  currencySymbol?: string;
  /** Optional text prefix, e.g. "Spent: " */
  prefix?: string;
  /** Optional text suffix */
  suffix?: string;
  /** Number of decimal places (default: 2) */
  decimals?: number;
  className?: string;
}

export function CurrencyText({
  amount,
  currencySymbol,
  prefix = '',
  suffix = '',
  decimals = 2,
  className = '',
  style,
  ...rest
}: CurrencyTextProps) {
  const storeSymbol = useSettingsStore((state) => state.currencySymbol);
  const activeSymbol = currencySymbol ?? storeSymbol ?? '₹';

  const validAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  const formatted = validAmount.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <Text className={className} style={style} {...rest}>
      {prefix}
      {activeSymbol}
      {formatted}
      {suffix}
    </Text>
  );
}
