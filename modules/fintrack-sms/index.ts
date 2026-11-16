import { requireNativeModule, EventEmitter } from 'expo-modules-core';

let FinTrackSms: any = null;
try {
  FinTrackSms = requireNativeModule('FinTrackSms');
} catch (e) {
  // Graceful fallback when running in Expo Go, Web, or non-native environment
}

const emitter = FinTrackSms ? new EventEmitter(FinTrackSms) : null;

export interface SmsInboxMessage {
  id: string;
  address: string;
  body: string;
  date: number;
}

export type SmsSubscription = { remove: () => void };

/**
 * Reads SMS messages directly from Android SMS inbox (content://sms/inbox).
 * Requires READ_SMS permission.
 */
export async function readSmsInbox(
  limit: number = 100,
  sinceTimestamp: number = 0
): Promise<SmsInboxMessage[]> {
  if (!FinTrackSms?.readSmsInbox) {
    return [];
  }
  return await FinTrackSms.readSmsInbox(limit, sinceTimestamp);
}

/**
 * Subscribes to real-time incoming SMS events broadcasted by Android.
 * Requires RECEIVE_SMS permission.
 */
export function addSmsListener(
  listener: (sms: { sender: string; body: string; date: number }) => void
): SmsSubscription | null {
  if (!emitter) return null;
  return (emitter as any).addListener('onSmsReceived', listener);
}

export function isNativeSmsAvailable(): boolean {
  return FinTrackSms !== null;
}
