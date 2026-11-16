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

console.log(`\nCore Engine Test Summary: ${passed} Passed, ${failed} Failed.`);
if (failed > 0) {
  process.exit(1);
}
