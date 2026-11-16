// ============================================================
// src/services/smsService.ts
// FinTrack SMS Service: Permission management, SMS ingestion,
// parsing, WatermelonDB transaction persistence, and test simulator.
// ============================================================

import { PermissionsAndroid, Platform } from 'react-native';
import { Category, ExpenseType, Source, TransactionRecord } from '@/types';
import { parseSms, ParsedSmsResult } from './smsParser';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useBudgetStore } from '@/stores/useBudgetStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { updateSettingsInDB } from '@/db/database';
import { showToast } from '@/components/ui/ToastNotification';

// --------------- Sample SMS Dataset for Simulator ---------------

export interface SmsSample {
  id: string;
  bankName: string;
  title: string;
  body: string;
  expectedAmount: number;
  expectedCategory: Category;
  expectedExpenseType: ExpenseType;
  expectedMerchant: string;
  type: 'debit' | 'rejection';
}

export const SAMPLE_SMS_DATASET: SmsSample[] = [
  {
    id: 'hdfc-upi',
    bankName: 'HDFC Bank',
    title: 'HDFC UPI (Swiggy)',
    body: 'Dear Customer, INR 450.00 debited from A/C **1234 on 15-Nov-2024 to VPA swiggy@hdfcbank (UPI Ref No 432109876543). Avl Bal: INR 12,450.50.',
    expectedAmount: 450,
    expectedCategory: Category.Food,
    expectedExpenseType: ExpenseType.Wants,
    expectedMerchant: 'Swiggy',
    type: 'debit',
  },
  {
    id: 'sbi-atm',
    bankName: 'SBI',
    title: 'SBI ATM Cash Withdrawal',
    body: 'Your A/C X6789 Debited for Rs.2500.00 on 14/11/24 at ATM CASH WDL KORMANGALA. Avl Bal Rs:15,320.00 - State Bank of India',
    expectedAmount: 2500,
    expectedCategory: Category.Other,
    expectedExpenseType: ExpenseType.Needs,
    expectedMerchant: 'ATM CASH WDL KORMANGALA',
    type: 'debit',
  },
  {
    id: 'icici-pos',
    bankName: 'ICICI Bank',
    title: 'ICICI POS Debit (Amazon)',
    body: 'Dear Customer, your Acct XX9012 is debited for Rs 1,299.00 on 13-Nov-24. Info: INF*AMAZON*123. Avail Bal is Rs 45,210.00.',
    expectedAmount: 1299,
    expectedCategory: Category.Shopping,
    expectedExpenseType: ExpenseType.Wants,
    expectedMerchant: 'Amazon',
    type: 'debit',
  },
  {
    id: 'axis-card',
    bankName: 'Axis Bank',
    title: 'Axis Card Swipe (Blinkit)',
    body: 'Transaction Alert: INR 650.00 debited from Axis Bank Card ending 3456 on 15-Nov-24 at Blinkit. Avail Limit: 48,000.',
    expectedAmount: 650,
    expectedCategory: Category.Groceries,
    expectedExpenseType: ExpenseType.Needs,
    expectedMerchant: 'Blinkit',
    type: 'debit',
  },
  {
    id: 'phonepe-upi',
    bankName: 'PhonePe',
    title: 'PhonePe UPI (McDonald\'s)',
    body: "Paid Rs.320 to McDonald's on PhonePe using HDFC Bank (XX4321). UPI Ref: 432190876543.",
    expectedAmount: 320,
    expectedCategory: Category.Food,
    expectedExpenseType: ExpenseType.Wants,
    expectedMerchant: "McDonald's",
    type: 'debit',
  },
  {
    id: 'netflix-sub',
    bankName: 'ICICI Bank',
    title: 'Entertainment (Netflix)',
    body: 'Dear Customer, INR 649.00 debited from ICICI Bank Card ending 9876 on 15-Nov-24 towards Netflix. Avail Bal: INR 32,500.00',
    expectedAmount: 649,
    expectedCategory: Category.Entertainment,
    expectedExpenseType: ExpenseType.Wants,
    expectedMerchant: 'Netflix',
    type: 'debit',
  },
  {
    id: 'apollo-pharmacy',
    bankName: 'Kotak Bank',
    title: 'Healthcare (Apollo Pharmacy)',
    body: 'Sent Rs. 890.00 from Kotak Bank AC XX8901 to Apollo Pharmacy UPI ref 432156789012.',
    expectedAmount: 890,
    expectedCategory: Category.Healthcare,
    expectedExpenseType: ExpenseType.Needs,
    expectedMerchant: 'Apollo Pharmacy',
    type: 'debit',
  },
  {
    id: 'bescom-utility',
    bankName: 'PNB',
    title: 'Utilities (BESCOM Electricity)',
    body: 'Dear Customer, A/C *1234 debited for Rs 1500.00 on 14-Nov-24 by transfer to BESCOM Electricity. Avl Bal: Rs 8950.00 - PNB',
    expectedAmount: 1500,
    expectedCategory: Category.Utilities,
    expectedExpenseType: ExpenseType.Needs,
    expectedMerchant: 'BESCOM Electricity',
    type: 'debit',
  },
  {
    id: 'otp-rejection',
    bankName: 'HDFC Bank',
    title: 'OTP Test (Should Filter Out)',
    body: '482910 is your secret OTP for transaction of INR 1,500.00 on Flipkart. Do not share OTP with anyone.',
    expectedAmount: 0,
    expectedCategory: Category.Other,
    expectedExpenseType: ExpenseType.Needs,
    expectedMerchant: '',
    type: 'rejection',
  },
  {
    id: 'promo-rejection',
    bankName: 'Axis Bank',
    title: 'Promo Spam (Should Filter Out)',
    body: 'Congratulations! You are pre-approved for an instant personal loan of up to Rs 5,00,000 with zero interest. Apply now.',
    expectedAmount: 0,
    expectedCategory: Category.Other,
    expectedExpenseType: ExpenseType.Needs,
    expectedMerchant: '',
    type: 'rejection',
  },
];

// --------------- SMS Permission Management ---------------

/**
 * Checks whether Android READ_SMS and RECEIVE_SMS permissions are granted.
 * Gracefully returns false on iOS, Web, or when permissions are missing.
 */
export async function checkSmsPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return useSettingsStore.getState().smsPermissionGranted;
  }

  try {
    const hasReceive = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS
    );
    const hasRead = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_SMS
    );

    const isGranted = hasReceive && hasRead;
    useSettingsStore.getState().setSmsPermissionGranted(isGranted);
    return isGranted;
  } catch (error) {
    console.error('[smsService] checkSmsPermissions error:', error);
    return false;
  }
}

/**
 * Prompts user with native Android permission dialog for RECEIVE_SMS and READ_SMS.
 * Handles graceful degradation if user denies or dismisses.
 */
export async function requestSmsPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    // For iOS / web / simulator development: toggle permission in store
    const current = useSettingsStore.getState().smsPermissionGranted;
    const nextState = !current;
    useSettingsStore.getState().setSmsPermissionGranted(nextState);
    await updateSettingsInDB({ smsPermissionGranted: nextState });

    showToast({
      message: nextState
        ? 'SMS auto-detection enabled (Simulator Mode)'
        : 'SMS auto-detection disabled',
      variant: nextState ? 'success' : 'info',
    });
    return nextState;
  }

  try {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    ]);

    const receiveGranted =
      results[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] ===
      PermissionsAndroid.RESULTS.GRANTED;
    const readGranted =
      results[PermissionsAndroid.PERMISSIONS.READ_SMS] ===
      PermissionsAndroid.RESULTS.GRANTED;

    const allGranted = receiveGranted && readGranted;

    // Update Zustand store and WatermelonDB
    useSettingsStore.getState().setSmsPermissionGranted(allGranted);
    await updateSettingsInDB({ smsPermissionGranted: allGranted });

    if (allGranted) {
      showToast({
        message: 'SMS permission granted! Bank debit alerts will now be auto-logged.',
        variant: 'success',
      });
    } else {
      showToast({
        message: 'SMS permission denied. You can still test SMS using the Simulator.',
        variant: 'warning',
      });
    }

    return allGranted;
  } catch (error) {
    console.error('[smsService] requestSmsPermissions error:', error);
    showToast({
      message: 'Failed to request SMS permissions. Please check device settings.',
      variant: 'error',
    });
    return false;
  }
}

// --------------- SMS Ingestion & Transaction Creation ---------------

/**
 * Parses raw SMS text and, if it is a valid debit alert, writes the transaction
 * into WatermelonDB and synchronizes Zustand stores.
 *
 * @param body Raw SMS message text
 * @param timestamp Timestamp in ms when SMS was received (defaults to now)
 * @returns The parsed result and whether a transaction was logged
 */
export async function processIncomingSms(
  body: string,
  timestamp: number = Date.now()
): Promise<{ logged: boolean; parsed: ParsedSmsResult }> {
  // 1. Parse SMS
  const parsed = parseSms(body);

  if (!parsed.isDebit || !parsed.amount || parsed.amount <= 0) {
    console.log(
      `[smsService] Ignored non-debit SMS: ${parsed.rejectionReason || 'Not a debit transaction'}`
    );
    return { logged: false, parsed };
  }

  // 2. Insert into WatermelonDB via useTransactionStore
  const comments = `Auto: ${parsed.merchant || 'Bank Debit'}${
    parsed.accountRef ? ` (${parsed.accountRef})` : ''
  }`;

  try {
    await useTransactionStore.getState().addTransaction({
      amount: parsed.amount,
      category: parsed.category,
      expenseType: parsed.expenseType,
      source: Source.SMS_Auto,
      comments,
      timestamp,
      rawSms: body,
    });

    // 3. Re-compute budget derived values
    useBudgetStore.getState().computeDerivedValues();

    // 4. Trigger in-app toast notification
    const formattedAmount = parsed.amount.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
    });
    showToast({
      message: `₹${formattedAmount} auto-logged from SMS (${parsed.merchant}). Tap to review.`,
      variant: 'success',
      duration: 4000,
    });

    return { logged: true, parsed };
  } catch (error) {
    console.error('[smsService] Failed to insert auto-logged transaction:', error);
    showToast({
      message: 'Failed to auto-log SMS transaction. Please try again.',
      variant: 'error',
    });
    return { logged: false, parsed };
  }
}

// --------------- SMS Simulator (Developer & User Tool) ---------------

/**
 * Simulates receiving an incoming bank SMS.
 * Allows instant offline testing on emulator and real devices without sending real SMS.
 *
 * @param sampleSmsText Text of the SMS to simulate
 * @param timestamp Optional timestamp (defaults to current time)
 */
export async function simulateIncomingSms(
  sampleSmsText: string,
  timestamp: number = Date.now()
): Promise<{ logged: boolean; parsed: ParsedSmsResult }> {
  return processIncomingSms(sampleSmsText, timestamp);
}
