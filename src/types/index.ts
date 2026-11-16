// ============================================================
// src/types/index.ts
// All shared enums and TypeScript types for FinTrack
// ============================================================

// --------------- Enums ---------------

export enum Category {
  Bills = 'Bills',
  Entertainment = 'Entertainment',
  Groceries = 'Groceries',
  Travel = 'Travel',
  Food = 'Food',
  Healthcare = 'Healthcare',
  Utilities = 'Utilities',
  Shopping = 'Shopping',
  EMI = 'EMI',
  Rent = 'Rent',
  Other = 'Other',
}

export type CategoryType = Category | string;

export enum ExpenseType {
  Needs = 'Needs',
  Wants = 'Wants',
  Savings = 'Savings',
}

export enum Source {
  Manual = 'Manual',
  SMS_Auto = 'SMS_Auto',
}

// --------------- WatermelonDB-backed entity types ---------------

export interface TransactionRecord {
  id: string;
  amount: number;
  category: Category | string;
  expenseType: ExpenseType;
  source: Source;
  comments?: string;
  timestamp: number;
  rawSms?: string;
  createdAt: number;
  updatedAt: number;
}

export type Transaction = TransactionRecord;

export interface BudgetRecord {
  id: string;
  month: number; // YYYYMM as a number, e.g. 202501
  totalBudget: number;
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
  createdAt: number;
  updatedAt: number;
}

export interface RecurringPaymentRecord {
  id: string;
  name: string;
  amount: number;
  category: Category | string;
  expenseType: ExpenseType;
  dueDay: number; // 1–31
  notifyDaysBefore: number;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SettingsRecord {
  id: string;
  currencySymbol: string;
  currencyCode: string;
  notificationTime: string; // HH:mm format, e.g. "09:00"
  smsPermissionGranted: boolean;
  notificationsEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// --------------- Zustand store state shapes ---------------

export interface SettingsState {
  currencySymbol: string;
  currencyCode: string;
  notificationTime: string;
  smsPermissionGranted: boolean;
  notificationsEnabled: boolean;
  // Actions
  setCurrencySymbol: (symbol: string) => void;
  setCurrencyCode: (code: string) => void;
  setNotificationTime: (time: string) => void;
  setSmsPermissionGranted: (granted: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  hydrate: (settings: Omit<SettingsState, 'hydrate' | 'setCurrencySymbol' | 'setCurrencyCode' | 'setNotificationTime' | 'setSmsPermissionGranted' | 'setNotificationsEnabled'>) => void;
}

export interface TransactionState {
  transactions: TransactionRecord[];
  currentMonthTransactions: TransactionRecord[];
  isLoading: boolean;
  // Actions
  loadTransactions: (all: TransactionRecord[], currentMonth: TransactionRecord[]) => void;
  addTransaction: (transaction: TransactionRecord) => void;
  deleteTransaction: (id: string) => void;
}

export interface BudgetState {
  budget: BudgetRecord | null;
  // Derived values (computed as getters in the store)
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
  // Actions
  setBudget: (budget: BudgetRecord) => void;
  updateSplits: (needsPct: number, wantsPct: number, savingsPct: number) => void;
}

export interface RecurringState {
  recurringPayments: RecurringPaymentRecord[];
  isLoading: boolean;
  // Actions
  loadRecurring: (payments: RecurringPaymentRecord[]) => void;
  addRecurring: (payment: RecurringPaymentRecord) => void;
  deleteRecurring: (id: string) => void;
  toggleActive: (id: string) => void;
}

// --------------- UI / Utility types ---------------

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastConfig {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

export interface CategoryMeta {
  label: string;
  icon: string; // @expo/vector-icons name
  color: string; // Tailwind color class
  defaultExpenseType: ExpenseType;
}

export type RootStackParamList = {
  '(tabs)': undefined;
  'modals/add-transaction': { editId?: string; transactionId?: string };
  'modals/add-recurring': { editId?: string };
};
