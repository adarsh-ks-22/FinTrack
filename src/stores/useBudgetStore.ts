// ============================================================
// src/stores/useBudgetStore.ts
// Zustand store for the current month's budget.
// Phase 3: Enhanced with setTotalBudget, setSplits, WatermelonDB
// persistence, and real-time reactivity with useTransactionStore.
// ============================================================

import { create } from 'zustand';
import { BudgetRecord, ExpenseType, TransactionRecord } from '@/types';
import { database } from '@/db/database';
import { Budget } from '@/db/models/Budget';
import { Q } from '@nozbe/watermelondb';
import { DEFAULT_BUDGET_SPLITS } from '@/constants/categories';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { triggerBudgetWarningNotification } from '@/services/notificationService';

// --------------- Derived value computation ---------------

export interface DerivedBudgetValues {
  totalBudget: number;
  needsLimit: number;
  wantsLimit: number;
  savingsTarget: number;
  totalSpent: number;
  needsSpent: number;
  wantsSpent: number;
  savedSoFar: number;
  remainingBudget: number;
  needsExceeded: boolean;
  wantsExceeded: boolean;
  budgetExceeded: boolean;
}

function computeDerived(
  budget: BudgetRecord | null,
  transactions: TransactionRecord[]
): DerivedBudgetValues {
  if (!budget) {
    const needsSpent = transactions
      .filter((t) => t.expenseType === ExpenseType.Needs)
      .reduce((sum, t) => sum + t.amount, 0);

    const wantsSpent = transactions
      .filter((t) => t.expenseType === ExpenseType.Wants)
      .reduce((sum, t) => sum + t.amount, 0);

    const savingsSpent = transactions
      .filter((t) => t.expenseType === ExpenseType.Savings)
      .reduce((sum, t) => sum + t.amount, 0);

    const totalSpent = needsSpent + wantsSpent;

    return {
      totalBudget: 0,
      needsLimit: 0,
      wantsLimit: 0,
      savingsTarget: 0,
      totalSpent,
      needsSpent,
      wantsSpent,
      savedSoFar: savingsSpent,
      remainingBudget: 0,
      needsExceeded: false,
      wantsExceeded: false,
      budgetExceeded: false,
    };
  }

  const totalBudget = Math.max(0, budget.totalBudget);
  const needsLimit = (totalBudget * budget.needsPct) / 100;
  const wantsLimit = (totalBudget * budget.wantsPct) / 100;
  const savingsTarget = (totalBudget * budget.savingsPct) / 100;

  const needsSpent = transactions
    .filter((t) => t.expenseType === ExpenseType.Needs)
    .reduce((sum, t) => sum + t.amount, 0);

  const wantsSpent = transactions
    .filter((t) => t.expenseType === ExpenseType.Wants)
    .reduce((sum, t) => sum + t.amount, 0);

  const savingsSpent = transactions
    .filter((t) => t.expenseType === ExpenseType.Savings)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSpent = needsSpent + wantsSpent;
  const savedSoFar = savingsSpent + Math.max(0, savingsTarget - Math.max(0, totalSpent - (needsLimit + wantsLimit)));
  const remainingBudget = Math.max(0, totalBudget - totalSpent);

  return {
    totalBudget,
    needsLimit,
    wantsLimit,
    savingsTarget,
    totalSpent,
    needsSpent,
    wantsSpent,
    savedSoFar,
    remainingBudget,
    needsExceeded: needsLimit > 0 && needsSpent > needsLimit,
    wantsExceeded: wantsLimit > 0 && wantsSpent > wantsLimit,
    budgetExceeded: totalBudget > 0 && totalSpent > totalBudget,
  };
}

function checkAndNotifyBudgetBreach(
  prev: DerivedBudgetValues | null,
  next: DerivedBudgetValues
) {
  if (!prev) return;
  if (!prev.needsExceeded && next.needsExceeded) {
    triggerBudgetWarningNotification('needs', next.needsSpent, next.needsLimit);
  }
  if (!prev.wantsExceeded && next.wantsExceeded) {
    triggerBudgetWarningNotification('wants', next.wantsSpent, next.wantsLimit);
  }
  if (!prev.budgetExceeded && next.budgetExceeded) {
    triggerBudgetWarningNotification('total', next.totalSpent, next.totalBudget);
  }
}

// --------------- Helper ---------------

function mapBudget(b: Budget): BudgetRecord {
  return {
    id: b.id,
    month: b.month,
    totalBudget: b.totalBudget,
    needsPct: b.needsPct,
    wantsPct: b.wantsPct,
    savingsPct: b.savingsPct,
    createdAt: b.createdAt instanceof Date ? b.createdAt.getTime() : Number(b.createdAt),
    updatedAt: b.updatedAt instanceof Date ? b.updatedAt.getTime() : Number(b.updatedAt),
  };
}

function getCurrentMonthNumber(): number {
  const now = new Date();
  return now.getFullYear() * 100 + (now.getMonth() + 1);
}

// --------------- Store interface ---------------

export interface BudgetStoreState extends DerivedBudgetValues {
  // Core state
  budget: BudgetRecord | null;
  currentMonthTransactions: TransactionRecord[];

  // Actions
  setBudget: (budget: BudgetRecord) => void;
  clearBudget: () => void;
  setTotalBudget: (amount: number) => void;
  setSplits: (needsPct: number, wantsPct: number, savingsPct: number) => void;
  updateSplits: (needsPct: number, wantsPct: number, savingsPct: number) => void;
  syncTransactions: (transactions: TransactionRecord[]) => void;

  // Persistence and computation actions
  loadBudget: (month?: number) => Promise<void>;
  saveBudgetToDB: (
    totalBudget: number,
    needsPct: number,
    wantsPct: number,
    savingsPct: number,
    month?: number
  ) => Promise<void>;
  computeDerivedValues: () => void;
}

// --------------- Store Implementation ---------------

export const useBudgetStore = create<BudgetStoreState>()((set, get) => ({
  budget: null,
  currentMonthTransactions: [],

  // Initial derived values
  ...computeDerived(null, []),

  setBudget: (budget) => {
    const { currentMonthTransactions } = get();
    set({ budget, ...computeDerived(budget, currentMonthTransactions) });
  },

  clearBudget: () => {
    const { currentMonthTransactions } = get();
    set({ budget: null, ...computeDerived(null, currentMonthTransactions) });
  },

  /**
   * Synchronously sets total budget amount and recalculates all derived limits & status
   */
  setTotalBudget: (amount: number) => {
    const { budget, currentMonthTransactions } = get();
    const cleanAmount = Math.max(0, amount);
    let updated: BudgetRecord;

    if (budget) {
      updated = { ...budget, totalBudget: cleanAmount };
    } else {
      updated = {
        id: `temp_${Date.now()}`,
        month: getCurrentMonthNumber(),
        totalBudget: cleanAmount,
        needsPct: DEFAULT_BUDGET_SPLITS.needsPct,
        wantsPct: DEFAULT_BUDGET_SPLITS.wantsPct,
        savingsPct: DEFAULT_BUDGET_SPLITS.savingsPct,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

    set({ budget: updated, ...computeDerived(updated, currentMonthTransactions) });
  },

  /**
   * Synchronously sets the percentage splits (Needs, Wants, Savings)
   */
  setSplits: (needsPct: number, wantsPct: number, savingsPct: number) => {
    const { budget, currentMonthTransactions } = get();
    let updated: BudgetRecord;

    if (budget) {
      updated = { ...budget, needsPct, wantsPct, savingsPct };
    } else {
      updated = {
        id: `temp_${Date.now()}`,
        month: getCurrentMonthNumber(),
        totalBudget: 0,
        needsPct,
        wantsPct,
        savingsPct,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }

    set({ budget: updated, ...computeDerived(updated, currentMonthTransactions) });
  },

  // Alias for backward compatibility
  updateSplits: (needsPct: number, wantsPct: number, savingsPct: number) => {
    get().setSplits(needsPct, wantsPct, savingsPct);
  },

  /**
   * Called whenever the transaction store updates — keeps derived budget
   * values in sync without re-fetching from DB.
   */
  syncTransactions: (transactions) => {
    const { budget } = get();
    const prevDerived = get();
    const nextDerived = computeDerived(budget, transactions);
    checkAndNotifyBudgetBreach(prevDerived, nextDerived);
    set({
      currentMonthTransactions: transactions,
      ...nextDerived,
    });
  },

  /**
   * Re-compute all derived values reading from the transaction store.
   */
  computeDerivedValues: () => {
    const { budget } = get();
    const txStore = useTransactionStore.getState();
    const transactions = txStore.currentMonthTransactions;
    set({
      currentMonthTransactions: transactions,
      ...computeDerived(budget, transactions),
    });
  },

  /**
   * Load budget from DB for the given YYYYMM. Creates a default if none exists.
   */
  loadBudget: async (monthParam?: number) => {
    const targetMonth = monthParam ?? getCurrentMonthNumber();
    const collection = database.get<Budget>('budgets');
    const existing = await collection
      .query(Q.where('month', targetMonth))
      .fetch();

    let budgetRecord: BudgetRecord;

    if (existing.length > 0) {
      budgetRecord = mapBudget(existing[0]);
    } else {
      // Create default 50/30/20 budget with total=0
      let newBudget!: Budget;
      await database.write(async () => {
        newBudget = await collection.create((b) => {
          b.month = targetMonth;
          b.totalBudget = 0;
          b.needsPct = DEFAULT_BUDGET_SPLITS.needsPct;
          b.wantsPct = DEFAULT_BUDGET_SPLITS.wantsPct;
          b.savingsPct = DEFAULT_BUDGET_SPLITS.savingsPct;
        });
      });
      budgetRecord = mapBudget(newBudget);
    }

    const txStore = useTransactionStore.getState();
    const transactions = txStore.currentMonthTransactions;
    set({
      budget: budgetRecord,
      currentMonthTransactions: transactions,
      ...computeDerived(budgetRecord, transactions),
    });
  },

  /**
   * Save (upsert) budget values to DB for the given or current month.
   */
  saveBudgetToDB: async (
    totalBudget: number,
    needsPct: number,
    wantsPct: number,
    savingsPct: number,
    monthParam?: number
  ) => {
    const targetMonth = monthParam ?? getCurrentMonthNumber();
    const collection = database.get<Budget>('budgets');

    const existing = await collection
      .query(Q.where('month', targetMonth))
      .fetch();

    let saved!: Budget;
    if (existing.length > 0) {
      // Update existing record
      await database.write(async () => {
        const record = existing[0];
        await record.update((b) => {
          b.totalBudget = totalBudget;
          b.needsPct = needsPct;
          b.wantsPct = wantsPct;
          b.savingsPct = savingsPct;
        });
        saved = record;
      });
    } else {
      // Create new record
      await database.write(async () => {
        saved = await collection.create((b) => {
          b.month = targetMonth;
          b.totalBudget = totalBudget;
          b.needsPct = needsPct;
          b.wantsPct = wantsPct;
          b.savingsPct = savingsPct;
        });
      });
    }

    const budgetRecord = mapBudget(saved);
    const txStore = useTransactionStore.getState();
    const transactions = txStore.currentMonthTransactions;
    set({
      budget: budgetRecord,
      currentMonthTransactions: transactions,
      ...computeDerived(budgetRecord, transactions),
    });
  },
}));

// --------------- Real-time Reactive Subscription ---------------
// Automatically synchronizes budget whenever useTransactionStore changes
useTransactionStore.subscribe((state) => {
  useBudgetStore.getState().syncTransactions(state.currentMonthTransactions);
});
