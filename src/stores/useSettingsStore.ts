// ============================================================
// src/stores/useSettingsStore.ts
// Zustand store for app settings — persisted via AsyncStorage
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SETTINGS } from '@/constants/categories';

export interface SettingsStoreState {
  // State
  currencySymbol: string;
  currencyCode: string;
  notificationTime: string;
  smsPermissionGranted: boolean;
  notificationsEnabled: boolean;
  _hydrated: boolean;

  // Actions
  setCurrency: (symbol: string, code: string) => void;
  setCurrencySymbol: (symbol: string) => void;
  setCurrencyCode: (code: string) => void;
  setNotificationTime: (time: string) => void;
  setSmsPermissionGranted: (granted: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  hydrate: (settings: {
    currencySymbol: string;
    currencyCode: string;
    notificationTime: string;
    smsPermissionGranted: boolean;
    notificationsEnabled: boolean;
  }) => void;
}

export const useSettingsStore = create<SettingsStoreState>()(
  persist(
    (set) => ({
      // Default state (overwritten by DB hydration on first launch)
      currencySymbol: DEFAULT_SETTINGS.currencySymbol,
      currencyCode: DEFAULT_SETTINGS.currencyCode,
      notificationTime: DEFAULT_SETTINGS.notificationTime,
      smsPermissionGranted: DEFAULT_SETTINGS.smsPermissionGranted,
      notificationsEnabled: DEFAULT_SETTINGS.notificationsEnabled,
      _hydrated: false,

      // Actions
      setCurrency: (symbol, code) => set({ currencySymbol: symbol, currencyCode: code }),
      setCurrencySymbol: (symbol) => set({ currencySymbol: symbol }),
      setCurrencyCode: (code) => set({ currencyCode: code }),
      setNotificationTime: (time) => set({ notificationTime: time }),
      setSmsPermissionGranted: (granted) => set({ smsPermissionGranted: granted }),
      setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),

      /**
       * Called from root _layout on mount after reading WatermelonDB Settings row.
       * Syncs store with the persisted DB values.
       */
      hydrate: (settings) =>
        set({
          currencySymbol: settings.currencySymbol,
          currencyCode: settings.currencyCode,
          notificationTime: settings.notificationTime,
          smsPermissionGranted: settings.smsPermissionGranted,
          notificationsEnabled: settings.notificationsEnabled,
          _hydrated: true,
        }),
    }),
    {
      name: 'fintrack-settings',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist these fields
      partialize: (state) => ({
        currencySymbol: state.currencySymbol,
        currencyCode: state.currencyCode,
        notificationTime: state.notificationTime,
        smsPermissionGranted: state.smsPermissionGranted,
        notificationsEnabled: state.notificationsEnabled,
      }),
    }
  )
);
