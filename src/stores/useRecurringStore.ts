// ============================================================
// src/stores/useRecurringStore.ts
// Zustand store for recurring payments — with WatermelonDB persistence
// and notification synchronization.
// ============================================================

import { create } from 'zustand';
import { RecurringPaymentRecord, Category, ExpenseType } from '@/types';
import { database } from '@/db/database';
import { RecurringPayment } from '@/db/models/RecurringPayment';
import {
  scheduleRecurringPaymentNotification,
  cancelRecurringPaymentNotification,
  rescheduleAllRecurringReminders,
} from '@/services/notificationService';

export interface NewRecurringPaymentData {
  name: string;
  amount: number;
  category: Category | string;
  expenseType: ExpenseType;
  dueDay: number;
  notifyDaysBefore: number;
  isActive: boolean;
}

export interface RecurringStoreState {
  // State
  recurringPayments: RecurringPaymentRecord[];
  isLoading: boolean;

  // Synchronous store actions
  loadRecurring: (payments: RecurringPaymentRecord[]) => void;
  addRecurring: (payment: RecurringPaymentRecord) => void;
  deleteRecurring: (id: string) => void;
  toggleActive: (id: string) => void;
  setLoading: (loading: boolean) => void;

  // DB persistence actions
  refreshFromDB: () => Promise<void>;
  addRecurringToDB: (data: NewRecurringPaymentData) => Promise<RecurringPaymentRecord>;
  updateRecurringInDB: (
    id: string,
    data: Partial<NewRecurringPaymentData>
  ) => Promise<RecurringPaymentRecord | null>;
  deleteRecurringFromDB: (id: string) => Promise<void>;
  toggleActiveInDB: (id: string) => Promise<boolean>;
}

function mapRecurring(r: RecurringPayment): RecurringPaymentRecord {
  return {
    id: r.id,
    name: r.name,
    amount: r.amount,
    category: r.category,
    expenseType: r.expenseType,
    dueDay: r.dueDay,
    notifyDaysBefore: r.notifyDaysBefore,
    isActive: r.isActive,
    createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.getTime() : Number(r.updatedAt),
  };
}

export const useRecurringStore = create<RecurringStoreState>()((set, get) => ({
  recurringPayments: [],
  isLoading: false,

  /**
   * Replaces the entire list — called from WatermelonDB observable or refreshFromDB.
   */
  loadRecurring: (payments) => {
    set({ recurringPayments: payments, isLoading: false });
  },

  /**
   * Optimistically adds a recurring payment.
   */
  addRecurring: (payment) => {
    const { recurringPayments } = get();
    // Prevent duplicate entries
    const filtered = recurringPayments.filter((p) => p.id !== payment.id);
    set({ recurringPayments: [payment, ...filtered] });
  },

  /**
   * Removes a recurring payment by id.
   */
  deleteRecurring: (id) => {
    const { recurringPayments } = get();
    set({ recurringPayments: recurringPayments.filter((p) => p.id !== id) });
  },

  /**
   * Toggles the isActive flag for a recurring payment in memory.
   */
  toggleActive: (id) => {
    const { recurringPayments } = get();
    set({
      recurringPayments: recurringPayments.map((p) =>
        p.id === id ? { ...p, isActive: !p.isActive } : p
      ),
    });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  /**
   * Refreshes recurring payments from WatermelonDB.
   */
  refreshFromDB: async () => {
    try {
      set({ isLoading: true });
      const collection = database.get<RecurringPayment>('recurring_payments');
      const records = await collection.query().fetch();
      const mapped = records.map(mapRecurring);
      set({ recurringPayments: mapped, isLoading: false });
    } catch (error) {
      console.error('[useRecurringStore] refreshFromDB failed:', error);
      set({ isLoading: false });
    }
  },

  /**
   * Inserts a new recurring payment into WatermelonDB and schedules notification.
   */
  addRecurringToDB: async (data: NewRecurringPaymentData) => {
    set({ isLoading: true });
    try {
      const collection = database.get<RecurringPayment>('recurring_payments');
      let createdRecord!: RecurringPayment;

      await database.write(async () => {
        createdRecord = await collection.create((r) => {
          r.name = data.name.trim();
          r.amount = data.amount;
          r.category = data.category;
          r.expenseType = data.expenseType;
          r.dueDay = data.dueDay;
          r.notifyDaysBefore = data.notifyDaysBefore;
          r.isActive = data.isActive;
        });
      });

      const mapped = mapRecurring(createdRecord);
      get().addRecurring(mapped);

      // Schedule notification if active
      if (mapped.isActive) {
        await scheduleRecurringPaymentNotification(mapped);
      }

      set({ isLoading: false });
      return mapped;
    } catch (error) {
      set({ isLoading: false });
      console.error('[useRecurringStore] addRecurringToDB failed:', error);
      throw error;
    }
  },

  /**
   * Updates an existing recurring payment in WatermelonDB.
   */
  updateRecurringInDB: async (id: string, data: Partial<NewRecurringPaymentData>) => {
    set({ isLoading: true });
    try {
      const collection = database.get<RecurringPayment>('recurring_payments');
      const record = await collection.find(id);

      await database.write(async () => {
        await record.update((r) => {
          if (data.name !== undefined) r.name = data.name.trim();
          if (data.amount !== undefined) r.amount = data.amount;
          if (data.category !== undefined) r.category = data.category;
          if (data.expenseType !== undefined) r.expenseType = data.expenseType;
          if (data.dueDay !== undefined) r.dueDay = data.dueDay;
          if (data.notifyDaysBefore !== undefined) r.notifyDaysBefore = data.notifyDaysBefore;
          if (data.isActive !== undefined) r.isActive = data.isActive;
        });
      });

      const mapped = mapRecurring(record);

      // Update in memory
      const { recurringPayments } = get();
      set({
        recurringPayments: recurringPayments.map((p) => (p.id === id ? mapped : p)),
        isLoading: false,
      });

      // Update notification
      if (mapped.isActive) {
        await scheduleRecurringPaymentNotification(mapped);
      } else {
        await cancelRecurringPaymentNotification(id);
      }

      return mapped;
    } catch (error) {
      set({ isLoading: false });
      console.error('[useRecurringStore] updateRecurringInDB failed:', error);
      throw error;
    }
  },

  /**
   * Permanently deletes a recurring payment and cancels its notification.
   */
  deleteRecurringFromDB: async (id: string) => {
    try {
      const collection = database.get<RecurringPayment>('recurring_payments');
      const record = await collection.find(id);

      await database.write(async () => {
        await record.destroyPermanently();
      });

      get().deleteRecurring(id);
      await cancelRecurringPaymentNotification(id);
    } catch (error) {
      console.error('[useRecurringStore] deleteRecurringFromDB failed:', error);
      throw error;
    }
  },

  /**
   * Toggles active state in WatermelonDB and updates notification schedule.
   */
  toggleActiveInDB: async (id: string) => {
    try {
      const collection = database.get<RecurringPayment>('recurring_payments');
      const record = await collection.find(id);
      const newActive = !record.isActive;

      await database.write(async () => {
        await record.update((r) => {
          r.isActive = newActive;
        });
      });

      const mapped = mapRecurring(record);
      get().toggleActive(id);

      if (newActive) {
        await scheduleRecurringPaymentNotification(mapped);
      } else {
        await cancelRecurringPaymentNotification(id);
      }

      return newActive;
    } catch (error) {
      console.error('[useRecurringStore] toggleActiveInDB failed:', error);
      throw error;
    }
  },
}));
