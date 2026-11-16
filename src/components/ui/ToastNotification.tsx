// ============================================================
// src/components/ui/ToastNotification.tsx
// In-app toast / snackbar notification component.
// Usage: render <ToastNotification /> at the root of your screen,
// then call the exported helper to show toasts imperatively.
// ============================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ToastVariant } from '@/types';

// --------------- Toast config ---------------

interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  duration?: number; // ms
}

interface ToastEntry extends Required<ToastOptions> {
  id: number;
}

type Listener = (entry: ToastEntry) => void;
const listeners: Set<Listener> = new Set();
let counter = 0;

/** Call this anywhere in the app to show a toast. */
export function showToast(options: ToastOptions): void {
  const entry: ToastEntry = {
    id: ++counter,
    message: options.message,
    variant: options.variant ?? 'info',
    duration: options.duration ?? 3000,
  };
  listeners.forEach((l) => l(entry));
}

// --------------- Variant styles ---------------

const VARIANT_STYLES: Record<
  ToastVariant,
  { bg: string; icon: React.ComponentProps<typeof Ionicons>['name']; iconColor: string }
> = {
  success: { bg: 'bg-green-600', icon: 'checkmark-circle', iconColor: '#ffffff' },
  error: { bg: 'bg-red-600', icon: 'close-circle', iconColor: '#ffffff' },
  warning: { bg: 'bg-yellow-500', icon: 'warning', iconColor: '#ffffff' },
  info: { bg: 'bg-blue-600', icon: 'information-circle', iconColor: '#ffffff' },
};

// --------------- Component ---------------

export function ToastNotification() {
  const [toast, setToast] = useState<ToastEntry | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const show = useCallback(
    (entry: ToastEntry) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast(entry);
      opacity.setValue(0);
      translateY.setValue(-20);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      hideTimer.current = setTimeout(hide, entry.duration);
    },
    [hide, opacity, translateY]
  );

  useEffect(() => {
    listeners.add(show);
    return () => {
      listeners.delete(show);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [show]);

  if (!toast) return null;

  const styles = VARIANT_STYLES[toast.variant];

  return (
    <Animated.View
      style={{ opacity, transform: [{ translateY }] }}
      className={`absolute left-4 right-4 top-14 z-50 flex-row items-center gap-3 rounded-xl px-4 py-3 shadow-lg ${styles.bg}`}
      pointerEvents="box-none"
    >
      <Ionicons name={styles.icon} size={20} color={styles.iconColor} />
      <Text className="flex-1 text-sm font-medium text-white" numberOfLines={2}>
        {toast.message}
      </Text>
      <TouchableOpacity onPress={hide} className="p-1">
        <Ionicons name="close" size={16} color="#ffffff" />
      </TouchableOpacity>
    </Animated.View>
  );
}
