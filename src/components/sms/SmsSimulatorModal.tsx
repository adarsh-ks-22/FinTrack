// ============================================================
// src/components/sms/SmsSimulatorModal.tsx
// Developer and User Tool: Test Indian Bank & UPI SMS parsing
// with 1-tap presets and real-time live preview before auto-logging.
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { parseSms } from '@/services/smsParser';
import {
  simulateIncomingSms,
  SAMPLE_SMS_DATASET,
  SmsSample,
} from '@/services/smsService';
import { CATEGORY_META, EXPENSE_TYPE_BG_COLORS, EXPENSE_TYPE_COLORS } from '@/constants/categories';
import { CurrencyText } from '@/components/ui/CurrencyText';
import { Badge } from '@/components/ui/Badge';
import { showToast } from '@/components/ui/ToastNotification';

interface SmsSimulatorModalProps {
  visible: boolean;
  onClose: () => void;
}

export function SmsSimulatorModal({ visible, onClose }: SmsSimulatorModalProps) {
  // Currently selected sample
  const [selectedSampleId, setSelectedSampleId] = useState<string>(SAMPLE_SMS_DATASET[0].id);
  // Current text in input (can be edited by user)
  const [smsText, setSmsText] = useState<string>(SAMPLE_SMS_DATASET[0].body);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Compute live parsed result
  const parsed = useMemo(() => parseSms(smsText), [smsText]);

  const handleSelectSample = (sample: SmsSample) => {
    setSelectedSampleId(sample.id);
    setSmsText(sample.body);
  };

  const handleSimulate = async () => {
    if (!parsed.isDebit || !parsed.amount) {
      showToast({
        message: 'This SMS was filtered out and cannot be logged as an expense.',
        variant: 'warning',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await simulateIncomingSms(smsText);
      if (result.logged) {
        onClose();
      }
    } catch (error) {
      console.error('[SmsSimulatorModal] Simulation error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryMeta = parsed.category ? CATEGORY_META[parsed.category] : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end bg-black/50"
      >
        <View className="max-h-[90%] rounded-t-3xl bg-white px-5 pb-8 pt-4 dark:bg-gray-900 shadow-2xl">
          {/* Header Bar */}
          <View className="mb-4 flex-row items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
            <View className="flex-row items-center gap-2">
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900">
                <Ionicons name="chatbox-ellipses" size={20} color="#2563eb" />
              </View>
              <View>
                <Text className="text-base font-bold text-gray-900 dark:text-gray-100">
                  SMS Parser Simulator
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  Instant offline Indian Bank & UPI SMS testing
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="rounded-full bg-gray-100 p-2 dark:bg-gray-800"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} className="space-y-4">
            {/* Quick Sample Selector */}
            <View>
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                1-Tap Bank Presets
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {SAMPLE_SMS_DATASET.map((sample) => {
                  const isSelected = sample.id === selectedSampleId;
                  const isRejection = sample.type === 'rejection';
                  return (
                    <TouchableOpacity
                      key={sample.id}
                      onPress={() => handleSelectSample(sample)}
                      className={`rounded-xl px-3 py-2 border ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40'
                          : isRejection
                          ? 'border-gray-200 bg-red-50/50 dark:border-gray-700 dark:bg-red-950/20'
                          : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
                      }`}
                      activeOpacity={0.7}
                    >
                      <View className="flex-row items-center gap-1.5">
                        {isRejection ? (
                          <Ionicons name="alert-circle" size={14} color="#ef4444" />
                        ) : (
                          <Ionicons
                            name="card"
                            size={14}
                            color={isSelected ? '#2563eb' : '#6b7280'}
                          />
                        )}
                        <Text
                          className={`text-xs font-semibold ${
                            isSelected
                              ? 'text-blue-700 dark:text-blue-400'
                              : isRejection
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {sample.title}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Editable SMS Text Input */}
            <View className="mt-3">
              <View className="mb-1.5 flex-row items-center justify-between">
                <Text className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  SMS Message Text
                </Text>
                {smsText ? (
                  <TouchableOpacity
                    onPress={() => setSmsText('')}
                    hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                  >
                    <Text className="text-xs text-blue-600">Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TextInput
                value={smsText}
                onChangeText={setSmsText}
                placeholder="Paste or type any Indian bank debit SMS here..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                style={{ textAlignVertical: 'top', minHeight: 75 }}
              />
            </View>

            {/* Live Parsed Preview */}
            <View className="mt-4">
              <Text className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Live Parser Preview
              </Text>

              {parsed.isDebit && parsed.amount ? (
                /* Valid Debit Preview Card */
                <View className="rounded-2xl border border-green-200 bg-green-50/60 p-4 dark:border-green-900 dark:bg-green-950/20">
                  {/* Status & Bank */}
                  <View className="flex-row items-center justify-between pb-3 border-b border-green-100 dark:border-green-900/50">
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                      <Text className="text-xs font-bold text-green-700 dark:text-green-400">
                        Valid Debit Alert
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      {parsed.bankName && (
                        <Badge
                          label={parsed.bankName}
                          className="bg-blue-100 dark:bg-blue-900"
                          textClassName="text-blue-700 dark:text-blue-300"
                          size="sm"
                        />
                      )}
                      <Badge
                        label={`${parsed.confidence.toUpperCase()} CONFIDENCE`}
                        className="bg-gray-100 dark:bg-gray-800"
                        textClassName="text-gray-600 dark:text-gray-400"
                        size="sm"
                      />
                    </View>
                  </View>

                  {/* Main Parsed Values */}
                  <View className="mt-3 flex-row items-center justify-between">
                    <View>
                      <Text className="text-xs text-gray-500 dark:text-gray-400">Amount</Text>
                      <CurrencyText
                        amount={parsed.amount}
                        decimals={2}
                        className="text-2xl font-extrabold text-gray-900 dark:text-white"
                      />
                    </View>

                    <View className="items-end">
                      <Text className="text-xs text-gray-500 dark:text-gray-400">Merchant</Text>
                      <Text className="text-base font-bold text-gray-800 dark:text-gray-100">
                        {parsed.merchant}
                      </Text>
                    </View>
                  </View>

                  {/* Badges: Category + Expense Type + Account */}
                  <View className="mt-4 flex-row flex-wrap items-center gap-2 pt-3 border-t border-green-100 dark:border-green-900/50">
                    {/* Category with Icon */}
                    <View className="flex-row items-center gap-1.5 rounded-full bg-white px-3 py-1 shadow-sm dark:bg-gray-800">
                      <Ionicons
                        name={(categoryMeta?.icon as any) || 'pricetag'}
                        size={14}
                        color="#4b5563"
                      />
                      <Text className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {parsed.category}
                      </Text>
                    </View>

                    {/* Expense Type (Needs / Wants / Savings) */}
                    <View
                      className={`rounded-full px-3 py-1 ${
                        EXPENSE_TYPE_BG_COLORS[parsed.expenseType]
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          EXPENSE_TYPE_COLORS[parsed.expenseType]
                        }`}
                      >
                        {parsed.expenseType}
                      </Text>
                    </View>

                    {/* Account Ref */}
                    {parsed.accountRef && (
                      <View className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
                        <Text className="text-xs font-medium text-gray-600 dark:text-gray-300">
                          A/C {parsed.accountRef}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                /* Non-Debit / Filtered Out Card */
                <View className="rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/20">
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="shield-outline" size={20} color="#dc2626" />
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-red-700 dark:text-red-400">
                        Filtered Out (Non-Debit SMS)
                      </Text>
                      <Text className="mt-0.5 text-xs text-red-600 dark:text-red-300">
                        {parsed.rejectionReason || 'No debit detected'}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    FinTrack automatically filters out OTPs, login verification codes,
                    promotional offers, credit alerts, and balance checks to prevent junk
                    transactions.
                  </Text>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View className="mt-5 space-y-2.5">
              <TouchableOpacity
                onPress={handleSimulate}
                disabled={!parsed.isDebit || !parsed.amount || isSubmitting}
                className={`flex-row items-center justify-center gap-2 rounded-2xl py-3.5 shadow-sm ${
                  parsed.isDebit && parsed.amount && !isSubmitting
                    ? 'bg-blue-600'
                    : 'bg-gray-300 dark:bg-gray-800'
                }`}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={parsed.isDebit ? 'flash' : 'ban'}
                  size={18}
                  color={parsed.isDebit ? '#ffffff' : '#9ca3af'}
                />
                <Text
                  className={`text-sm font-bold ${
                    parsed.isDebit ? 'text-white' : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {isSubmitting
                    ? 'Logging Transaction...'
                    : parsed.isDebit
                    ? 'Simulate & Auto-Log Expense'
                    : 'Ignored (Will Not Auto-Log)'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onClose}
                className="items-center py-2.5"
                activeOpacity={0.7}
              >
                <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Dismiss
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
