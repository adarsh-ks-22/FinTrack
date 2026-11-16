// ============================================================
// src/stores/useTransactionStore.ts
// Zustand store for transactions — hydrated from WatermelonDB.
// Phase 2: enriched with DB-write actions + date-range helpers.
// ============================================================

import { create } from 'zustand';
import { TransactionRecord, ExpenseType, Source, Category } from '@/types';
import { database } from '@/db/database';
import { Transaction } from '@/db/models/Transaction';

// --------------- Types ---------------

export interface NewTransactionData {
  amount: number;
  category: Category | string;
  expenseType: ExpenseType;
  source: Source;
  comments?: string;
  timestamp: number;
  rawSms?: string;
}

export interface TransactionStoreState {
  // State
  transactions: TransactionRecord[];
  currentMonthTransactions: TransactionRecord[];
  isLoading: boolean;

  // Actions
  setLoading: (loading: boolean) => void;
  loadTransactions: (
    all?: TransactionRecord[],
    currentMonth?: TransactionRecord[]
  ) => Promise<void>;
  addTransaction: (data: NewTransactionData) => Promise<void>;
  updateTransaction: (id: string, data: Partial<NewTransactionData>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  // Aliases for convenience / backward-compatibility
  addTransactionToDB: (data: NewTransactionData) => Promise<void>;
  updateTransactionInDB: (id: string, data: Partial<NewTransactionData>) => Promise<void>;
  deleteTransactionFromDB: (id: string) => Promise<void>;
  refreshFromDB: () => Promise<void>;

  // Synchronous helpers
  getTransactionsByDateRange: (start: number, end: number) => TransactionRecord[];
}

// --------------- Helper ---------------

function mapTransaction(t: Transaction): TransactionRecord {
  return {
    id: t.id,
    amount: t.amount,
    category: t.category,
    expenseType: t.expenseType,
    source: t.source,
    comments: t.comments ?? undefined,
    timestamp: t.timestamp,
    rawSms: t.rawSms ?? undefined,
    createdAt: t.createdAt instanceof Date ? t.createdAt.getTime() : Number(t.createdAt),
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.getTime() : Number(t.updatedAt),
  };
}

function getCurrentMonthStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
}

// --------------- Store ---------------

export const useTransactionStore = create<TransactionStoreState>()((set, get) => {
  const loadTransactions = async (
    all?: TransactionRecord[],
    currentMonth?: TransactionRecord[]
  ) => {
    if (all !== undefined && currentMonth !== undefined) {
      set({
        transactions: all,
        currentMonthTransactions: currentMonth,
        isLoading: false,
      });
      return;
    }

    set({ isLoading: true });
    try {
      const collection = database.get<Transaction>('transactions');
      const records = await collection.query().fetch();
      const allTx: TransactionRecord[] = records
        .map(mapTransaction)
        .sort((a, b) => b.timestamp - a.timestamp);
      const startTs = getCurrentMonthStart();
      const currentMonthTx = allTx.filter((t) => t.timestamp >= startTs);
      set({
        transactions: allTx,
        currentMonthTransactions: currentMonthTx,
        isLoading: false,
      });
    } catch (error) {
      console.error('[useTransactionStore] loadTransactions error:', error);
      set({ isLoading: false });
    }
  };

  const addTransaction = async (data: NewTransactionData) => {
    const collection = database.get<Transaction>('transactions');
    await database.write(async () => {
      await collection.create((t) => {
        t.amount = data.amount;
        t.category = data.category;
        t.expenseType = data.expenseType;
        t.source = data.source;
        t.comments = data.comments ?? null;
        t.timestamp = data.timestamp;
        t.rawSms = data.rawSms ?? null;
      });
    });
    await loadTransactions();
  };

  const updateTransaction = async (id: string, data: Partial<NewTransactionData>) => {
    const collection = database.get<Transaction>('transactions');
    await database.write(async () => {
      const record = await collection.find(id);
      await record.update((t) => {
        if (data.amount !== undefined) t.amount = data.amount;
        if (data.category !== undefined) t.category = data.category;
        if (data.expenseType !== undefined) t.expenseType = data.expenseType;
        if (data.comments !== undefined) t.comments = data.comments ?? null;
        if (data.timestamp !== undefined) t.timestamp = data.timestamp;
      });
    });
    await loadTransactions();
  };

  const deleteTransaction = async (id: string) => {
    const collection = database.get<Transaction>('transactions');
    await database.write(async () => {
      const record = await collection.find(id);
      await record.destroyPermanently();
    });
    await loadTransactions();
  };

  return {
    transactions: [],
    currentMonthTransactions: [],
    isLoading: false,

    setLoading: (loading) => set({ isLoading: loading }),

    loadTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,

    // Aliases
    addTransactionToDB: addTransaction,
    updateTransactionInDB: updateTransaction,
    deleteTransactionFromDB: deleteTransaction,
    refreshFromDB: () => loadTransactions(),

    getTransactionsByDateRange: (start, end) => {
      return get().transactions.filter((t) => t.timestamp >= start && t.timestamp <= end);
    },
  };
});
