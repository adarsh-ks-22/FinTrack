// ============================================================
// app/(tabs)/settings.tsx
// Comprehensive Settings & Preferences Screen
// Phase 6: Global Currency Selector, Monthly Ledger PDF Export,
// Notification Time Configuration, SMS Auto-Detection Controls,
// and Data & Storage Management (JSON backup & wipe).
// ============================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';

import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Badge } from '@/components/ui/Badge';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useRecurringStore } from '@/stores/useRecurringStore';
import { useBudgetStore } from '@/stores/useBudgetStore';
import {
  updateSettingsInDB,
  getDatabaseStorageInfo,
  resetDatabaseToDefaults,
  DatabaseStorageInfo,
} from '@/db/database';
import { DEFAULT_SETTINGS } from '@/constants/categories';
import { requestSmsPermissions } from '@/services/smsService';
import {
  requestNotificationPermissions,
  scheduleDailyEveningReview,
  cancelDailyEveningReview,
  rescheduleAllRecurringReminders,
} from '@/services/notificationService';
import {
  generateMonthlyLedgerPDF,
  getMonthName,
} from '@/services/pdfExportService';
import { exportDatabaseBackup } from '@/services/backupService';
import { SmsSimulatorModal } from '@/components/sms/SmsSimulatorModal';
import { ToastNotification, showToast } from '@/components/ui/ToastNotification';

// --------------- Supported Currencies ---------------

export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
  display: string;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', display: '₹ INR (Indian Rupee)' },
  { code: 'USD', symbol: '$', name: 'US Dollar', display: '$ USD (US Dollar)' },
  { code: 'EUR', symbol: '€', name: 'Euro', display: '€ EUR (Euro)' },
  { code: 'GBP', symbol: '£', name: 'British Pound', display: '£ GBP (British Pound)' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', display: '¥ JPY (Japanese Yen)' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', display: 'A$ AUD (Australian Dollar)' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', display: 'C$ CAD (Canadian Dollar)' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', display: 'AED (UAE Dirham)' },
];

// --------------- Month Option ---------------

export interface MonthOption {
  year: number;
  month: number;
  label: string;
  isCurrent: boolean;
}

function getPastMonths(count = 12): MonthOption[] {
  const options: MonthOption[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  for (let i = 0; i <= count; i++) {
    const d = new Date(currentYear, currentMonth - 1 - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const label = `${getMonthName(month)} ${year}`;
    options.push({
      year,
      month,
      label,
      isCurrent: i === 0,
    });
  }
  return options;
}

// --------------- Settings Row Component ---------------

interface SettingsRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  iconBgColor?: string;
  label: string;
  subtitle?: string;
  value?: string;
  badge?: React.ReactNode;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}

function SettingsRow({
  icon,
  iconColor = '#3b82f6',
  iconBgColor = 'bg-blue-50 dark:bg-blue-950/40',
  label,
  subtitle,
  value,
  badge,
  rightElement,
  onPress,
  destructive = false,
}: SettingsRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3.5 dark:border-gray-800"
      activeOpacity={onPress ? 0.6 : 1}
    >
      <View className="flex-row items-center gap-3 flex-1 mr-2">
        <View className={`h-9 w-9 items-center justify-center rounded-xl ${iconBgColor}`}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              className={`text-sm font-semibold ${
                destructive ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-100'
              }`}
            >
              {label}
            </Text>
            {badge}
          </View>
          {subtitle ? (
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</Text>
          ) : null}
        </View>
      </View>
      <View className="flex-row items-center gap-2">
        {value ? (
          <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">{value}</Text>
        ) : null}
        {rightElement}
        {onPress && !rightElement ? (
          <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ============================================================
// Main Settings Screen Component
// ============================================================

export default function SettingsScreen() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  const handleToggleTheme = (value: boolean) => {
    setColorScheme(value ? 'dark' : 'light');
    showToast({
      message: value ? 'Dark mode activated' : 'Light mode activated',
      variant: 'info',
    });
  };

  const {
    currencySymbol,
    currencyCode,
    notificationTime,
    smsPermissionGranted,
    notificationsEnabled,
    setCurrency,
    setNotificationTime,
    setNotificationsEnabled,
    setSmsPermissionGranted,
    hydrate,
  } = useSettingsStore();

  const allTransactions = useTransactionStore((s) => s.transactions);

  // Modals & State
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);

  // Month selector for PDF export
  const monthOptions = useMemo(() => getPastMonths(12), []);
  const [selectedMonth, setSelectedMonth] = useState<MonthOption>(monthOptions[0]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);

  // Time custom input
  const [customTimeInput, setCustomTimeInput] = useState(notificationTime || '20:00');
  const [timeError, setTimeError] = useState<string | null>(null);

  // Database Storage metrics
  const [storageInfo, setStorageInfo] = useState<DatabaseStorageInfo>({
    transactionCount: 0,
    recurringCount: 0,
    budgetCount: 0,
    estimatedSizeBytes: 32768,
    estimatedSizeFormatted: '32.0 KB',
  });

  const loadStorageMetrics = async () => {
    try {
      const info = await getDatabaseStorageInfo();
      setStorageInfo(info);
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    loadStorageMetrics();
  }, [allTransactions.length]);

  // --------------- Currency Handlers ---------------

  const handleSelectCurrency = async (option: CurrencyOption) => {
    try {
      setCurrency(option.symbol, option.code);
      await updateSettingsInDB({
        currencySymbol: option.symbol,
        currencyCode: option.code,
      });
      setShowCurrencyModal(false);
      showToast({
        message: `Global currency set to ${option.display}`,
        variant: 'success',
      });
    } catch (e) {
      console.error('[Settings] Error saving currency:', e);
      showToast({
        message: 'Could not update currency preference',
        variant: 'error',
      });
    }
  };

  // --------------- Notification Handlers ---------------

  const handleToggleNotifications = async (value: boolean) => {
    if (value) {
      const granted = await requestNotificationPermissions();
      if (granted) {
        await scheduleDailyEveningReview(notificationTime);
        await rescheduleAllRecurringReminders(useRecurringStore.getState().recurringPayments);
        showToast({
          message: 'Notifications enabled & scheduled',
          variant: 'success',
        });
      } else {
        showToast({
          message: 'Notification permission not granted',
          variant: 'warning',
        });
      }
    } else {
      setNotificationsEnabled(false);
      await updateSettingsInDB({ notificationsEnabled: false });
      await cancelDailyEveningReview();
      showToast({
        message: 'Notifications disabled',
        variant: 'info',
      });
    }
  };

  const validateAndFormatTime = (timeStr: string): boolean => {
    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
    return timeRegex.test(timeStr.trim());
  };

  const handleSaveNotificationTime = async (newTime: string) => {
    const trimmed = newTime.trim();
    if (!validateAndFormatTime(trimmed)) {
      setTimeError('Invalid time. Please use 24-hour format HH:mm (e.g. 20:00).');
      return;
    }

    // Normalize e.g. 9:00 -> 09:00
    const parts = trimmed.split(':');
    const normalized = `${parts[0].padStart(2, '0')}:${parts[1]}`;

    try {
      setNotificationTime(normalized);
      await updateSettingsInDB({ notificationTime: normalized });
      if (notificationsEnabled) {
        await scheduleDailyEveningReview(normalized);
      }
      setShowTimeModal(false);
      setTimeError(null);
      showToast({
        message: `Daily review reminder scheduled for ${normalized} IST`,
        variant: 'success',
      });
    } catch (err) {
      console.error('[Settings] Error updating notification time:', err);
      showToast({
        message: 'Failed to update notification time',
        variant: 'error',
      });
    }
  };

  // --------------- SMS Handlers ---------------

  const handleToggleSms = async (value: boolean) => {
    if (value) {
      await requestSmsPermissions();
    } else {
      setSmsPermissionGranted(false);
      await updateSettingsInDB({ smsPermissionGranted: false });
      showToast({
        message: 'SMS auto-detection disabled',
        variant: 'info',
      });
    }
  };

  // --------------- PDF Generation Handler ---------------

  const handleGeneratePdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await generateMonthlyLedgerPDF({
        year: selectedMonth.year,
        month: selectedMonth.month,
        currencySymbol,
        currencyCode,
      });
      showToast({
        message: `PDF Statement generated for ${selectedMonth.label}!`,
        variant: 'success',
      });
    } catch (error) {
      console.error('[Settings] PDF export failed:', error);
      showToast({
        message: 'Failed to generate PDF. Please try again.',
        variant: 'error',
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  // --------------- JSON Database Backup Handler ---------------

  const handleExportJsonBackup = async () => {
    if (isExportingBackup) return;
    setIsExportingBackup(true);
    try {
      await exportDatabaseBackup();
      showToast({
        message: 'Database JSON backup generated and shared!',
        variant: 'success',
      });
    } catch (err) {
      console.error('[Settings] JSON backup export error:', err);
      showToast({
        message: 'Failed to export database backup',
        variant: 'error',
      });
    } finally {
      setIsExportingBackup(false);
    }
  };

  // --------------- Reset Database Flow (Double Confirmation) ---------------

  const handleResetDatabase = () => {
    Alert.alert(
      'Reset Local Database?',
      'Are you sure you want to erase all transactions, budget plans, and recurring payments? This action cannot be reversed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue...',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '⚠️ Final Confirmation',
              'This will permanently wipe all local SQLite data and reset app preferences to factory defaults. Do you wish to proceed?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Wipe Everything',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await resetDatabaseToDefaults();
                      // Reset Zustand stores
                      useTransactionStore.getState().loadTransactions([], []);
                      useRecurringStore.getState().loadRecurring([]);
                      useBudgetStore.getState().clearBudget();
                      hydrate({
                        currencySymbol: DEFAULT_SETTINGS.currencySymbol,
                        currencyCode: DEFAULT_SETTINGS.currencyCode,
                        notificationTime: DEFAULT_SETTINGS.notificationTime,
                        smsPermissionGranted: DEFAULT_SETTINGS.smsPermissionGranted,
                        notificationsEnabled: DEFAULT_SETTINGS.notificationsEnabled,
                      });
                      await loadStorageMetrics();
                      showToast({
                        message: 'Database wiped and restored to factory defaults.',
                        variant: 'info',
                      });
                    } catch (resetErr) {
                      console.error('[Settings] Reset error:', resetErr);
                      showToast({
                        message: 'Failed to clear local database.',
                        variant: 'error',
                      });
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  // --------------- Render Screen ---------------

  const activeCurrency =
    SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode && c.symbol === currencySymbol) || {
      code: currencyCode,
      symbol: currencySymbol,
      name: 'Custom',
      display: `${currencySymbol} ${currencyCode}`,
    };

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900" edges={['top']}>
      <ScreenHeader title="Settings & Tools" />

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* ── 1. Appearance / Theme Section ── */}
        <View className="mt-4">
          <Text className="mb-1.5 px-4 text-xs font-bold uppercase tracking-wider text-gray-400">
            Appearance
          </Text>
          <View className="mx-4 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-gray-800 border border-gray-100 dark:border-gray-800">
            <SettingsRow
              icon={isDarkMode ? 'moon' : 'sunny-outline'}
              iconColor={isDarkMode ? '#818cf8' : '#f59e0b'}
              iconBgColor={isDarkMode ? 'bg-indigo-950/40' : 'bg-amber-50 dark:bg-amber-950/40'}
              label="Dark Mode"
              subtitle={isDarkMode ? 'Dark theme is active' : 'Light theme is active'}
              rightElement={
                <Switch
                  value={isDarkMode}
                  onValueChange={handleToggleTheme}
                  trackColor={{ false: '#d1d5db', true: '#818cf8' }}
                  thumbColor={isDarkMode ? '#4f46e5' : '#f3f4f6'}
                />
              }
            />
          </View>
        </View>

        {/* ── 2. Global Currency Section ── */}
        <View className="mt-6">
          <Text className="mb-1.5 px-4 text-xs font-bold uppercase tracking-wider text-gray-400">
            Global Currency
          </Text>
          <View className="mx-4 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-gray-800 border border-gray-100 dark:border-gray-800">
            <SettingsRow
              icon="cash-outline"
              iconColor="#2563eb"
              iconBgColor="bg-blue-50 dark:bg-blue-900/40"
              label="Display Currency"
              subtitle="Re-renders all currency text instances across all tabs"
              value={activeCurrency.display}
              onPress={() => setShowCurrencyModal(true)}
            />
          </View>
        </View>

        {/* ── 3. Monthly Ledger PDF Export Section ── */}
        <View className="mt-6">
          <Text className="mb-1.5 px-4 text-xs font-bold uppercase tracking-wider text-gray-400">
            Monthly Ledger PDF Export
          </Text>
          <View className="mx-4 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-gray-800 border border-gray-100 dark:border-gray-800 p-4">
            <View className="flex-row items-center gap-3 mb-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/50">
                <Ionicons name="document-text" size={22} color="#6366f1" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Generate Ledger Statement
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Print-ready PDF with executive summary, 50/30/20 splits &amp; itemized table.
                </Text>
              </View>
            </View>

            {/* Target Period Selector Button */}
            <TouchableOpacity
              onPress={() => setShowMonthModal(true)}
              className="flex-row items-center justify-between rounded-xl bg-gray-50 px-3.5 py-3 dark:bg-gray-750/70 border border-gray-200 dark:border-gray-700"
              activeOpacity={0.7}
            >
              <View className="flex-row items-center gap-2.5">
                <Ionicons name="calendar-outline" size={17} color="#4f46e5" />
                <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">Target Month:</Text>
                <Text className="text-xs font-bold text-gray-800 dark:text-gray-100">
                  {selectedMonth.label}
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Text className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Change</Text>
                <Ionicons name="chevron-down" size={14} color="#6366f1" />
              </View>
            </TouchableOpacity>

            {/* PDF Generation Button */}
            <TouchableOpacity
              onPress={handleGeneratePdf}
              disabled={isExportingPdf}
              className="mt-3.5 flex-row items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 shadow-sm active:bg-indigo-700 disabled:opacity-60"
            >
              {isExportingPdf ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="share-outline" size={18} color="#ffffff" />
              )}
              <Text className="text-sm font-bold text-white">
                {isExportingPdf ? 'Synthesizing PDF...' : '📄 Generate & Share Monthly Ledger PDF'}
              </Text>
            </TouchableOpacity>

            <View className="mt-2.5 flex-row items-center justify-center gap-1.5">
              <Ionicons name="shield-checkmark-outline" size={12} color="#10b981" />
              <Text className="text-[11px] text-gray-400 dark:text-gray-500">
                100% On-Device synthesis via expo-print • Zero server transmission
              </Text>
            </View>
          </View>
        </View>

        {/* ── 3. Notification Time Preferences ── */}
        <View className="mt-6">
          <Text className="mb-1.5 px-4 text-xs font-bold uppercase tracking-wider text-gray-400">
            Notifications &amp; Reminders
          </Text>
          <View className="mx-4 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-gray-800 border border-gray-100 dark:border-gray-800">
            <SettingsRow
              icon="notifications-outline"
              iconColor="#f59e0b"
              iconBgColor="bg-amber-50 dark:bg-amber-950/40"
              label="Enable Notifications"
              subtitle="Daily reminders &amp; budget limit warnings"
              rightElement={
                <Switch
                  value={notificationsEnabled}
                  onValueChange={handleToggleNotifications}
                  trackColor={{ false: '#d1d5db', true: '#fde68a' }}
                  thumbColor={notificationsEnabled ? '#f59e0b' : '#f3f4f6'}
                />
              }
            />
            <SettingsRow
              icon="time-outline"
              iconColor="#3b82f6"
              iconBgColor="bg-blue-50 dark:bg-blue-950/40"
              label="Daily Evening Review Time"
              subtitle="Reminder to log bedtime cash expenses"
              value={`${notificationTime || '20:00'} IST`}
              onPress={() => {
                setCustomTimeInput(notificationTime || '20:00');
                setTimeError(null);
                setShowTimeModal(true);
              }}
            />
          </View>
        </View>

        {/* ── 4. SMS Auto-Detection Section ── */}
        <View className="mt-6">
          <Text className="mb-1.5 px-4 text-xs font-bold uppercase tracking-wider text-gray-400">
            SMS Auto-Detection
          </Text>
          <View className="mx-4 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-gray-800 border border-gray-100 dark:border-gray-800">
            <SettingsRow
              icon="chatbubble-ellipses-outline"
              iconColor="#10b981"
              iconBgColor="bg-emerald-50 dark:bg-emerald-950/40"
              label="SMS Auto-Detection"
              subtitle="Parse bank debit alerts &amp; UPI messages"
              badge={
                <Badge
                  label={smsPermissionGranted ? 'Active' : 'Inactive'}
                  variant={smsPermissionGranted ? 'success' : 'default'}
                  size="sm"
                />
              }
              rightElement={
                <Switch
                  value={smsPermissionGranted}
                  onValueChange={handleToggleSms}
                  trackColor={{ false: '#d1d5db', true: '#a7f3d0' }}
                  thumbColor={smsPermissionGranted ? '#10b981' : '#f3f4f6'}
                />
              }
            />
            <SettingsRow
              icon="flask-outline"
              iconColor="#8b5cf6"
              iconBgColor="bg-purple-50 dark:bg-purple-950/40"
              label="SMS Parser Simulator"
              subtitle="Test parsing on HDFC, SBI, ICICI, Axis &amp; PhonePe alerts"
              value="Open Tool"
              onPress={() => setShowSimulator(true)}
            />
          </View>

          {/* Privacy Note */}
          <View className="mx-4 mt-2.5 flex-row items-start gap-2.5 rounded-xl bg-blue-50/70 p-3.5 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
            <Ionicons name="shield-checkmark" size={17} color="#2563eb" style={{ marginTop: 1 }} />
            <Text className="flex-1 text-xs leading-relaxed text-blue-900 dark:text-blue-200">
              <Text className="font-bold">100% Offline &amp; Private:</Text> SMS messages are processed strictly inside
              the device sandbox. OTPs, personal conversations, and promotions are ignored and never written to storage.
            </Text>
          </View>
        </View>

        {/* ── 5. Data & Storage Management ── */}
        <View className="mt-6">
          <Text className="mb-1.5 px-4 text-xs font-bold uppercase tracking-wider text-gray-400">
            Data &amp; Local Storage
          </Text>
          <View className="mx-4 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-gray-800 border border-gray-100 dark:border-gray-800">
            {/* Database Stats Row */}
            <View className="border-b border-gray-100 p-4 dark:border-gray-800">
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="server-outline" size={18} color="#6366f1" />
                  <Text className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    WatermelonDB Status
                  </Text>
                </View>
                <Badge label="100% Local SQLite" variant="info" size="sm" />
              </View>

              <View className="flex-row items-center justify-between rounded-xl bg-gray-50 p-3 dark:bg-gray-900/60">
                <View className="items-center flex-1 border-r border-gray-200 dark:border-gray-800">
                  <Text className="text-xs text-gray-400">Transactions</Text>
                  <Text className="text-base font-bold text-gray-800 dark:text-gray-100 mt-0.5">
                    {storageInfo.transactionCount}
                  </Text>
                </View>
                <View className="items-center flex-1 border-r border-gray-200 dark:border-gray-800">
                  <Text className="text-xs text-gray-400">Recurring</Text>
                  <Text className="text-base font-bold text-gray-800 dark:text-gray-100 mt-0.5">
                    {storageInfo.recurringCount}
                  </Text>
                </View>
                <View className="items-center flex-1">
                  <Text className="text-xs text-gray-400">Est. Size</Text>
                  <Text className="text-base font-bold text-gray-800 dark:text-gray-100 mt-0.5">
                    {storageInfo.estimatedSizeFormatted}
                  </Text>
                </View>
              </View>
            </View>

            {/* Local JSON Backup Action */}
            <SettingsRow
              icon="download-outline"
              iconColor="#059669"
              iconBgColor="bg-emerald-50 dark:bg-emerald-950/40"
              label="Export Local JSON Backup"
              subtitle="Share or save full database structured backup"
              rightElement={
                isExportingBackup ? (
                  <ActivityIndicator size="small" color="#059669" />
                ) : (
                  <Ionicons name="share-outline" size={17} color="#059669" />
                )
              }
              onPress={handleExportJsonBackup}
            />

            {/* Wipe / Clear Database Action */}
            <SettingsRow
              icon="trash-outline"
              iconColor="#dc2626"
              iconBgColor="bg-red-50 dark:bg-red-950/40"
              label="Reset Local Database"
              subtitle="Permanently erase transactions, budgets &amp; settings"
              destructive
              onPress={handleResetDatabase}
            />
          </View>
        </View>

        {/* ── 6. About FinTrack ── */}
        <View className="mt-6 mb-4">
          <Text className="mb-1.5 px-4 text-xs font-bold uppercase tracking-wider text-gray-400">
            About FinTrack
          </Text>
          <View className="mx-4 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-gray-800 border border-gray-100 dark:border-gray-800">
            <SettingsRow
              icon="information-circle-outline"
              iconColor="#6b7280"
              iconBgColor="bg-gray-100 dark:bg-gray-700"
              label="Version"
              value="1.0.1"
            />
            <SettingsRow
              icon="shield-outline"
              iconColor="#2563eb"
              iconBgColor="bg-blue-50 dark:bg-blue-950/40"
              label="Data Architecture"
              value="Offline-First WatermelonDB"
            />
            <SettingsRow
              icon="code-slash-outline"
              iconColor="#8b5cf6"
              iconBgColor="bg-purple-50 dark:bg-purple-950/40"
              label="Built With"
              value="Expo SDK 52 + NativeWind v4"
            />
          </View>
        </View>
      </ScrollView>

      {/* ============================================================
          MODAL: Global Currency Selector
      ============================================================ */}
      <Modal
        visible={showCurrencyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCurrencyModal(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center p-4"
          onPress={() => setShowCurrencyModal(false)}
        >
          <Pressable
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
              <View>
                <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Select Global Currency
                </Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Updates all tabs &amp; ledger calculations
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowCurrencyModal(false)}
                className="h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
              >
                <Ionicons name="close" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView className="max-h-80 my-2" showsVerticalScrollIndicator={false}>
              {SUPPORTED_CURRENCIES.map((item) => {
                const isSelected = item.code === currencyCode && item.symbol === currencySymbol;
                return (
                  <TouchableOpacity
                    key={`${item.code}_${item.symbol}`}
                    onPress={() => handleSelectCurrency(item)}
                    className={`flex-row items-center justify-between rounded-xl p-3 my-1 border ${
                      isSelected
                        ? 'bg-blue-50/80 border-blue-400 dark:bg-blue-950/40 dark:border-blue-700'
                        : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/40'
                    }`}
                  >
                    <View className="flex-row items-center gap-3">
                      <View className="h-9 w-9 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700">
                        <Text className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                          {item.symbol}
                        </Text>
                      </View>
                      <View>
                        <Text className="text-sm font-bold text-gray-800 dark:text-gray-100">
                          {item.name}
                        </Text>
                        <Text className="text-xs text-gray-400">{item.code}</Text>
                      </View>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={22} color="#2563eb" />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ============================================================
          MODAL: Month & Year Selector for PDF Export
      ============================================================ */}
      <Modal
        visible={showMonthModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMonthModal(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center p-4"
          onPress={() => setShowMonthModal(false)}
        >
          <Pressable
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
              <View>
                <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Select Ledger Period
                </Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Choose month to export (Past 12 months)
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowMonthModal(false)}
                className="h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
              >
                <Ionicons name="close" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView className="max-h-80 my-2" showsVerticalScrollIndicator={false}>
              {monthOptions.map((opt) => {
                const isSelected =
                  opt.year === selectedMonth.year && opt.month === selectedMonth.month;
                return (
                  <TouchableOpacity
                    key={`${opt.year}_${opt.month}`}
                    onPress={() => {
                      setSelectedMonth(opt);
                      setShowMonthModal(false);
                    }}
                    className={`flex-row items-center justify-between rounded-xl p-3 my-1 border ${
                      isSelected
                        ? 'bg-indigo-50/80 border-indigo-400 dark:bg-indigo-950/40 dark:border-indigo-700'
                        : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/40'
                    }`}
                  >
                    <View className="flex-row items-center gap-3">
                      <Ionicons
                        name="calendar"
                        size={18}
                        color={isSelected ? '#4f46e5' : '#9ca3af'}
                      />
                      <Text
                        className={`text-sm ${
                          isSelected ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        {opt.label}
                      </Text>
                    </View>
                    {opt.isCurrent ? (
                      <Badge label="Current" variant="info" size="sm" />
                    ) : isSelected ? (
                      <Ionicons name="checkmark-circle" size={20} color="#4f46e5" />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ============================================================
          MODAL: Daily Notification Time Configuration
      ============================================================ */}
      <Modal
        visible={showTimeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimeModal(false)}
      >
        <Pressable
          className="flex-1 bg-black/50 justify-center items-center p-4"
          onPress={() => setShowTimeModal(false)}
        >
          <Pressable
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-gray-800"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-700">
              <View>
                <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Daily Review Time
                </Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Evening reminder to review day's spend
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowTimeModal(false)}
                className="h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700"
              >
                <Ionicons name="close" size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            <Text className="text-xs font-semibold uppercase text-gray-400 mt-3 mb-2">
              Popular Times (IST)
            </Text>
            <View className="flex-row flex-wrap gap-2 mb-3">
              {[
                { time: '20:00', label: '8:00 PM (Default)' },
                { time: '21:00', label: '9:00 PM' },
                { time: '22:00', label: '10:00 PM' },
                { time: '09:00', label: '9:00 AM' },
              ].map((p) => (
                <TouchableOpacity
                  key={p.time}
                  onPress={() => {
                    setCustomTimeInput(p.time);
                    setTimeError(null);
                  }}
                  className={`rounded-lg px-3 py-1.5 border ${
                    customTimeInput === p.time
                      ? 'bg-blue-50 border-blue-500 dark:bg-blue-900/40'
                      : 'bg-gray-50 border-gray-200 dark:bg-gray-700 dark:border-gray-600'
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      customTimeInput === p.time
                        ? 'font-bold text-blue-600 dark:text-blue-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Input */}
            <Text className="text-xs font-semibold uppercase text-gray-400 mb-1">
              Custom Time (24h format HH:mm)
            </Text>
            <View className="flex-row items-center rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
              <Ionicons name="time-outline" size={18} color="#9ca3af" className="mr-2" />
              <TextInput
                className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-100 ml-2"
                placeholder="20:00"
                placeholderTextColor="#9ca3af"
                value={customTimeInput}
                onChangeText={(text) => {
                  setCustomTimeInput(text);
                  setTimeError(null);
                }}
                maxLength={5}
                keyboardType="numbers-and-punctuation"
              />
            </View>

            {timeError ? (
              <Text className="mt-1 text-xs text-red-500">{timeError}</Text>
            ) : null}

            {/* Save Button */}
            <TouchableOpacity
              onPress={() => handleSaveNotificationTime(customTimeInput)}
              className="mt-4 rounded-xl bg-blue-600 py-3 active:bg-blue-700 items-center justify-center"
            >
              <Text className="text-sm font-bold text-white">Save Notification Time</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Simulator Modal */}
      <SmsSimulatorModal visible={showSimulator} onClose={() => setShowSimulator(false)} />

      {/* Toast Notification Container */}
      <ToastNotification />
    </SafeAreaView>
  );
}
