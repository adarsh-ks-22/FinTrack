import { schema } from '../src/db/schema';
import { Category, ExpenseType, Source, TransactionRecord } from '../src/types';

console.log('--- Starting Core FinTrack Engine & Safeguards Test Suite ---');
let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`PASS: [${testName}]`);
    passed++;
  } else {
    console.error(`FAIL: [${testName}] ${detail || ''}`);
    failed++;
  }
}

// 1. WatermelonDB Schema Validation
assert(schema.version === 1, 'Schema version is 1', `Got: ${schema.version}`);
const tableNames = Object.keys(schema.tables);
assert(tableNames.includes('transactions'), 'Schema has transactions table');
assert(tableNames.includes('budgets'), 'Schema has budgets table');
assert(tableNames.includes('recurring_payments'), 'Schema has recurring_payments table');
assert(tableNames.includes('settings'), 'Schema has settings table');

const transactionsTable = schema.tables['transactions'];
assert(transactionsTable.columns['amount'] !== undefined, 'Transactions has amount column');
assert(transactionsTable.columns['category'] !== undefined, 'Transactions has category column');
assert(transactionsTable.columns['expense_type'] !== undefined, 'Transactions has expense_type column');
assert(transactionsTable.columns['timestamp'] !== undefined, 'Transactions has timestamp column');

// 2. Short-Month Clamping Logic for Recurring Bills
function calculateClampedDueDate(year: number, month: number /* 0-indexed */, dueDay: number): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Math.min(dueDay, daysInMonth);
}

// February non-leap year (e.g., 2025)
const feb2025Clamp = calculateClampedDueDate(2025, 1, 31);
assert(feb2025Clamp === 28, 'Feb 2025 clamps day 31 to 28', `Got: ${feb2025Clamp}`);

// February leap year (e.g., 2024)
const feb2024Clamp = calculateClampedDueDate(2024, 1, 31);
assert(feb2024Clamp === 29, 'Feb 2024 (leap year) clamps day 31 to 29', `Got: ${feb2024Clamp}`);

// April (30 days)
const aprClamp = calculateClampedDueDate(2025, 3, 31);
assert(aprClamp === 30, 'April clamps day 31 to 30', `Got: ${aprClamp}`);

// January (31 days)
const janClamp = calculateClampedDueDate(2025, 0, 31);
assert(janClamp === 31, 'January preserves day 31', `Got: ${janClamp}`);

// Regular day within month
const midMonth = calculateClampedDueDate(2025, 1, 15);
assert(midMonth === 15, 'Mid-month day 15 is preserved in February', `Got: ${midMonth}`);

// 3. Budget Normalization Logic
function normalizeSplits(needs: number, wants: number, savings: number) {
  const sum = needs + wants + savings;
  if (sum === 0) {
    return { needs: 50, wants: 30, savings: 20 };
  }
  const factor = 100 / sum;
  const n = Math.round(needs * factor);
  const w = Math.round(wants * factor);
  const s = Math.max(0, 100 - n - w);
  return { needs: n, wants: w, savings: s };
}

const norm1 = normalizeSplits(50, 30, 20);
assert(norm1.needs + norm1.wants + norm1.savings === 100, '50/30/20 sums to 100%');

const norm2 = normalizeSplits(60, 40, 20); // sum 120
assert(norm2.needs + norm2.wants + norm2.savings === 100, '60/40/20 normalizes to exactly 100%', `Got: ${JSON.stringify(norm2)}`);

const norm3 = normalizeSplits(0, 0, 0); // zero edge case
assert(norm3.needs === 50 && norm3.wants === 30 && norm3.savings === 20, '0/0/0 resets safely to default 50/30/20');

const norm4 = normalizeSplits(33, 33, 33); // 99%
assert(norm4.needs + norm4.wants + norm4.savings === 100, '33/33/33 normalizes to exactly 100%', `Got: ${JSON.stringify(norm4)}`);

// 4. Zero Transactions Safeguard (Division by Zero / NaN Prevention)
function computeCategoryProportions(transactions: { category: Category; amount: number }[]) {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  if (total === 0) {
    return { total: 0, items: [] };
  }
  return {
    total,
    items: transactions.map((t) => ({
      category: t.category,
      percentage: total > 0 ? (t.amount / total) * 100 : 0,
    })),
  };
}

const emptyProportions = computeCategoryProportions([]);
assert(emptyProportions.total === 0 && !isNaN(emptyProportions.total), 'Zero transactions does not produce NaN total');
assert(emptyProportions.items.length === 0, 'Zero transactions returns clean empty list');

// 5. Currency Formatting Safeguard
function formatCurrency(amount: number, symbol: string = '₹') {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return `${symbol}0.00`;
  }
  return `${symbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

assert(formatCurrency(0) === '₹0.00', 'Formats 0 correctly as ₹0.00');
assert(formatCurrency(1250.5, '$') === '$1,250.50', 'Formats $1250.50 correctly with USD symbol');
assert(formatCurrency(NaN) === '₹0.00', 'Handles NaN gracefully without crashing');

// 6. Budget Derived Values & Savings Baseline Safeguard
function computeDerivedBudget(
  budget: { totalBudget: number; needsPct: number; wantsPct: number; savingsPct: number } | null,
  transactions: { expenseType: ExpenseType; amount: number }[]
) {
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
    return {
      totalBudget: 0,
      needsLimit: 0,
      wantsLimit: 0,
      savingsTarget: 0,
      totalSpent: needsSpent + wantsSpent,
      needsSpent,
      wantsSpent,
      savedSoFar: savingsSpent,
      remainingBudget: 0,
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
  const savedSoFar = savingsSpent;
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

const testBudget = { totalBudget: 50000, needsPct: 50, wantsPct: 30, savingsPct: 20 };

// Zero transactions: savings must start at 0, not at savingsTarget (₹10,000)
const initialDerived = computeDerivedBudget(testBudget, []);
assert(initialDerived.savedSoFar === 0, 'Savings starts at 0 with zero transactions (not pre-filled)', `Got: ${initialDerived.savedSoFar}`);
assert(initialDerived.savingsTarget === 10000, 'Savings target correctly calculated as 20% of 50,000 (10,000)', `Got: ${initialDerived.savingsTarget}`);
assert(initialDerived.totalSpent === 0, 'Total spent starts at 0', `Got: ${initialDerived.totalSpent}`);
assert(initialDerived.remainingBudget === 50000, 'Remaining budget starts at full 50,000', `Got: ${initialDerived.remainingBudget}`);
assert(!initialDerived.budgetExceeded, 'Budget is not exceeded with zero transactions');

// Adding savings transaction increments savedSoFar starting from 0, and does not increase totalSpent
const txWithSavings = [
  { expenseType: ExpenseType.Savings, amount: 2500 },
];
const savingsDerived = computeDerivedBudget(testBudget, txWithSavings);
assert(savingsDerived.savedSoFar === 2500, 'Adding savings transaction increases savedSoFar from 0 to 2500', `Got: ${savingsDerived.savedSoFar}`);
assert(savingsDerived.totalSpent === 0, 'Savings transactions do not increase totalSpent', `Got: ${savingsDerived.totalSpent}`);
assert(savingsDerived.remainingBudget === 50000, 'Remaining budget not reduced by savings transactions');

// Reaching or exceeding savings goal
const txGoalMet = [
  { expenseType: ExpenseType.Savings, amount: 10000 },
];
const goalMetDerived = computeDerivedBudget(testBudget, txGoalMet);
assert(goalMetDerived.savedSoFar >= goalMetDerived.savingsTarget, 'Savings target met when savedSoFar equals savingsTarget');
assert(!goalMetDerived.budgetExceeded, 'Meeting savings target does not mark budget as exceeded');

// --- Calendar Date Picker Engine Tests ---
console.log('\n--- Running Calendar Date Picker Tests ---');
const {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  parse,
  isValid,
} = require('date-fns');

// Verify calendar grid produces full 7-day weeks (multiples of 7)
const nov2026 = new Date(2026, 10, 1); // Nov 2026
const gridStart = startOfWeek(startOfMonth(nov2026), { weekStartsOn: 0 });
const gridEnd = endOfWeek(endOfMonth(nov2026), { weekStartsOn: 0 });
const novGridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
assert(novGridDays.length % 7 === 0, 'Calendar grid generates complete 7-day weeks', `Got: ${novGridDays.length}`);
assert(novGridDays.length >= 28 && novGridDays.length <= 42, 'Calendar grid length is within valid monthly bounds (28..42)');

// Verify DD/MM/YYYY formatting and round-trip parsing
const testDate = new Date(2026, 10, 16);
const formattedStr = format(testDate, 'dd/MM/yyyy');
assert(formattedStr === '16/11/2026', 'Formats date to DD/MM/YYYY', `Got: ${formattedStr}`);
const roundTrip = parse(formattedStr, 'dd/MM/yyyy', new Date());
assert(isValid(roundTrip) && roundTrip.getDate() === 16 && roundTrip.getMonth() === 10 && roundTrip.getFullYear() === 2026, 'Parses DD/MM/YYYY accurately round-trip');

console.log(`\nCore Engine Test Summary: ${passed} Passed, ${failed} Failed.`);
if (failed > 0) {
  process.exit(1);
}
