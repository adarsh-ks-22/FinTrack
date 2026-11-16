// ============================================================
// src/constants/categories.ts
// Category metadata with icons, colors, and default expense types
// ============================================================

import { Category, ExpenseType, CategoryMeta } from '@/types';

export const CATEGORY_META: Record<string, CategoryMeta> = {
  [Category.Bills]: {
    label: 'Bills',
    icon: 'receipt-outline',
    color: 'text-cyan-600',
    defaultExpenseType: ExpenseType.Needs,
  },
  [Category.Entertainment]: {
    label: 'Entertainment',
    icon: 'musical-notes',
    color: 'text-purple-500',
    defaultExpenseType: ExpenseType.Wants,
  },
  [Category.Groceries]: {
    label: 'Groceries',
    icon: 'cart',
    color: 'text-green-500',
    defaultExpenseType: ExpenseType.Needs,
  },
  [Category.Travel]: {
    label: 'Travel',
    icon: 'airplane',
    color: 'text-sky-500',
    defaultExpenseType: ExpenseType.Wants,
  },
  [Category.Food]: {
    label: 'Food',
    icon: 'restaurant',
    color: 'text-orange-500',
    defaultExpenseType: ExpenseType.Wants,
  },
  [Category.Healthcare]: {
    label: 'Healthcare',
    icon: 'medkit',
    color: 'text-red-500',
    defaultExpenseType: ExpenseType.Needs,
  },
  [Category.Utilities]: {
    label: 'Utilities',
    icon: 'flash',
    color: 'text-yellow-500',
    defaultExpenseType: ExpenseType.Needs,
  },
  [Category.Shopping]: {
    label: 'Shopping',
    icon: 'bag',
    color: 'text-pink-500',
    defaultExpenseType: ExpenseType.Wants,
  },
  [Category.EMI]: {
    label: 'EMI',
    icon: 'card',
    color: 'text-indigo-500',
    defaultExpenseType: ExpenseType.Needs,
  },
  [Category.Rent]: {
    label: 'Rent',
    icon: 'home',
    color: 'text-teal-500',
    defaultExpenseType: ExpenseType.Needs,
  },
  [Category.Other]: {
    label: 'Other',
    icon: 'ellipsis-horizontal',
    color: 'text-gray-500',
    defaultExpenseType: ExpenseType.Wants,
  },
};

export const ALL_CATEGORIES: Category[] = Object.values(Category);

export function getCategoryMeta(cat: string): CategoryMeta {
  if (cat in CATEGORY_META) {
    return CATEGORY_META[cat];
  }
  return {
    label: cat,
    icon: 'pricetag-outline',
    color: 'text-indigo-600',
    defaultExpenseType: ExpenseType.Wants,
  };
}

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  [ExpenseType.Needs]: 'Needs',
  [ExpenseType.Wants]: 'Wants',
  [ExpenseType.Savings]: 'Savings',
};

export const EXPENSE_TYPE_COLORS: Record<ExpenseType, string> = {
  [ExpenseType.Needs]: 'text-blue-600',
  [ExpenseType.Wants]: 'text-orange-500',
  [ExpenseType.Savings]: 'text-green-600',
};

export const EXPENSE_TYPE_BG_COLORS: Record<ExpenseType, string> = {
  [ExpenseType.Needs]: 'bg-blue-100',
  [ExpenseType.Wants]: 'bg-orange-100',
  [ExpenseType.Savings]: 'bg-green-100',
};

export const DEFAULT_BUDGET_SPLITS = {
  needsPct: 50,
  wantsPct: 30,
  savingsPct: 20,
};

export const IST_TIMEZONE = 'Asia/Kolkata';

export const DEFAULT_SETTINGS = {
  currencySymbol: '₹',
  currencyCode: 'INR',
  notificationTime: '09:00',
  smsPermissionGranted: false,
  notificationsEnabled: true,
};
