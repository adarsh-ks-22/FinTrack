// ============================================================
// src/services/pdfExportService.ts
// Monthly Ledger PDF Export Pipeline using expo-print & expo-sharing.
// Generates an executive, print-ready financial statement with
// executive summaries, 50/30/20 budget allocations, category metrics,
// and itemized transaction tables.
// ============================================================

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { formatInTimeZone } from 'date-fns-tz';
import { Q } from '@nozbe/watermelondb';

import { transactionsCollection, budgetsCollection, settingsCollection } from '@/db/database';
import { Category, ExpenseType, Source, TransactionRecord } from '@/types';
import { IST_TIMEZONE } from '@/constants/categories';

// --------------- Types ---------------

export interface MonthlyLedgerExportOptions {
  year: number;
  month: number; // 1 - 12
  currencySymbol?: string;
  currencyCode?: string;
}

export interface MonthlySummaryData {
  monthName: string;
  year: number;
  targetYYYYMM: number;
  generatedAtIST: string;
  currencySymbol: string;
  currencyCode: string;
  totalBudget: number;
  totalSpent: number;
  remainingBalance: number;
  percentUsed: number;
  isOverBudget: boolean;
  needsLimit: number;
  needsSpent: number;
  needsPctUsed: number;
  needsStatus: 'On Track' | 'Exceeded';
  wantsLimit: number;
  wantsSpent: number;
  wantsPctUsed: number;
  wantsStatus: 'On Track' | 'Exceeded';
  savingsTarget: number;
  savingsSpent: number;
  savingsPctUsed: number;
  savingsStatus: 'On Track' | 'In Progress' | 'Exceeded' | 'No Target';
  categoryBreakdown: {
    category: Category | string;
    count: number;
    total: number;
    pctOfTotal: number;
  }[];
  transactions: TransactionRecord[];
}

// --------------- Helpers ---------------

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function getMonthName(monthNumber: number): string {
  return MONTH_NAMES[Math.max(1, Math.min(12, monthNumber)) - 1] ?? 'Unknown';
}

function formatCurrency(amount: number, symbol: string): string {
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `${symbol} ${safeAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --------------- Data Aggregation ---------------

export async function fetchLedgerDataForMonth(
  options: MonthlyLedgerExportOptions
): Promise<MonthlySummaryData> {
  const { year, month } = options;
  const monthName = getMonthName(month);
  const targetYYYYMM = year * 100 + month;
  const targetPrefix = `${year}${month.toString().padStart(2, '0')}`;

  // 1. Fetch settings for default currency
  const settingsRecords = await settingsCollection.query().fetch();
  const currentSettings = settingsRecords[0];
  const currencySymbol = options.currencySymbol || currentSettings?.currencySymbol || '₹';
  const currencyCode = options.currencyCode || currentSettings?.currencyCode || 'INR';

  // 2. Fetch budget for target month
  const budgetRecords = await budgetsCollection
    .query(Q.where('month', targetYYYYMM))
    .fetch();
  const budget = budgetRecords.length > 0 ? budgetRecords[0] : null;

  const totalBudget = budget ? Math.max(0, budget.totalBudget) : 0;
  const needsPct = budget ? budget.needsPct : 50;
  const wantsPct = budget ? budget.wantsPct : 30;
  const savingsPct = budget ? budget.savingsPct : 20;

  const needsLimit = (totalBudget * needsPct) / 100;
  const wantsLimit = (totalBudget * wantsPct) / 100;
  const savingsTarget = (totalBudget * savingsPct) / 100;

  // 3. Fetch all transactions and filter by target month in IST
  const allTx = await transactionsCollection.query().fetch();
  const monthTx: TransactionRecord[] = allTx
    .filter((t) => {
      const txMonthStr = formatInTimeZone(new Date(t.timestamp), IST_TIMEZONE, 'yyyyMM');
      return txMonthStr === targetPrefix;
    })
    .map((t) => ({
      id: t.id,
      amount: t.amount,
      category: t.category,
      expenseType: t.expenseType,
      source: t.source,
      comments: t.comments ?? undefined,
      timestamp: t.timestamp,
      rawSms: t.rawSms ?? undefined,
      createdAt: t.createdAt.getTime(),
      updatedAt: t.updatedAt.getTime(),
    }))
    .sort((a, b) => b.timestamp - a.timestamp);

  // 4. Calculate expense totals
  const needsSpent = monthTx
    .filter((t) => t.expenseType === ExpenseType.Needs)
    .reduce((sum, t) => sum + t.amount, 0);

  const wantsSpent = monthTx
    .filter((t) => t.expenseType === ExpenseType.Wants)
    .reduce((sum, t) => sum + t.amount, 0);

  const savingsSpent = monthTx
    .filter((t) => t.expenseType === ExpenseType.Savings)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSpent = needsSpent + wantsSpent;
  const remainingBalance = Math.max(0, totalBudget - totalSpent);
  const isOverBudget = totalBudget > 0 && totalSpent > totalBudget;
  const percentUsed = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  const needsPctUsed = needsLimit > 0 ? Math.round((needsSpent / needsLimit) * 100) : 0;
  const needsStatus: 'On Track' | 'Exceeded' =
    needsLimit > 0 && needsSpent > needsLimit ? 'Exceeded' : 'On Track';

  const wantsPctUsed = wantsLimit > 0 ? Math.round((wantsSpent / wantsLimit) * 100) : 0;
  const wantsStatus: 'On Track' | 'Exceeded' =
    wantsLimit > 0 && wantsSpent > wantsLimit ? 'Exceeded' : 'On Track';

  let savingsStatus: 'On Track' | 'In Progress' | 'Exceeded' | 'No Target' = 'No Target';
  if (savingsTarget > 0) {
    if (savingsSpent >= savingsTarget) {
      savingsStatus = 'Exceeded';
    } else if (savingsSpent > 0) {
      savingsStatus = 'In Progress';
    } else {
      savingsStatus = 'On Track';
    }
  }
  const savingsPctUsed = savingsTarget > 0 ? Math.round((savingsSpent / savingsTarget) * 100) : 0;

  // 5. Category Breakdown Aggregation
  const categoryMap = new Map<string, { count: number; total: number }>();
  for (const tx of monthTx) {
    const existing = categoryMap.get(tx.category) || { count: 0, total: 0 };
    categoryMap.set(tx.category, {
      count: existing.count + 1,
      total: existing.total + tx.amount,
    });
  }

  const allCategories = Array.from(new Set([...Object.values(Category), ...categoryMap.keys()]));
  const categoryBreakdown = allCategories
    .map((cat) => {
      const stats = categoryMap.get(cat) || { count: 0, total: 0 };
      const pctOfTotal = totalSpent > 0 ? Number(((stats.total / totalSpent) * 100).toFixed(1)) : 0;
      return {
        category: cat,
        count: stats.count,
        total: stats.total,
        pctOfTotal,
      };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.total - a.total);

  const now = new Date();
  const generatedAtIST = formatInTimeZone(now, IST_TIMEZONE, 'dd MMM yyyy, hh:mm a zzz');

  return {
    monthName,
    year,
    targetYYYYMM,
    generatedAtIST,
    currencySymbol,
    currencyCode,
    totalBudget,
    totalSpent,
    remainingBalance,
    percentUsed,
    isOverBudget,
    needsLimit,
    needsSpent,
    needsPctUsed,
    needsStatus,
    wantsLimit,
    wantsSpent,
    wantsPctUsed,
    wantsStatus,
    savingsTarget,
    savingsSpent,
    savingsPctUsed,
    savingsStatus,
    categoryBreakdown,
    transactions: monthTx,
  };
}

// --------------- HTML Template Generator ---------------

export function generateLedgerHTMLTemplate(data: MonthlySummaryData): string {
  const {
    monthName,
    year,
    generatedAtIST,
    currencySymbol,
    currencyCode,
    totalBudget,
    totalSpent,
    remainingBalance,
    percentUsed,
    isOverBudget,
    needsLimit,
    needsSpent,
    needsPctUsed,
    needsStatus,
    wantsLimit,
    wantsSpent,
    wantsPctUsed,
    wantsStatus,
    savingsTarget,
    savingsSpent,
    savingsPctUsed,
    savingsStatus,
    categoryBreakdown,
    transactions,
  } = data;

  const totalTxCount = transactions.length;

  // Render Category Table Rows
  const categoryRowsHtml =
    categoryBreakdown.length > 0
      ? categoryBreakdown
          .map((item) => {
            return `
        <tr>
          <td><strong>${escapeHtml(item.category)}</strong></td>
          <td style="text-align: center;">${item.count}</td>
          <td style="text-align: right; font-weight: 600;">${formatCurrency(item.total, currencySymbol)}</td>
          <td style="text-align: right;">
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
              <span>${item.pctOfTotal}%</span>
              <div style="width: 50px; background: #e2e8f0; height: 6px; border-radius: 3px; overflow: hidden;">
                <div style="width: ${Math.min(item.pctOfTotal, 100)}%; background: #3b82f6; height: 100%;"></div>
              </div>
            </div>
          </td>
        </tr>
      `;
          })
          .join('')
      : `<tr><td colspan="4" style="text-align: center; color: #64748b; padding: 16px;">No category expenses logged for this month.</td></tr>`;

  // Render Transaction Ledger Table Rows
  const transactionRowsHtml =
    transactions.length > 0
      ? transactions
          .map((tx, idx) => {
            const dateIST = formatInTimeZone(new Date(tx.timestamp), IST_TIMEZONE, 'dd MMM yyyy, hh:mm a');
            const typeBadgeStyle =
              tx.expenseType === ExpenseType.Needs
                ? 'background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;'
                : tx.expenseType === ExpenseType.Wants
                ? 'background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa;'
                : 'background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0;';

            const sourceBadge =
              tx.source === Source.SMS_Auto
                ? '<span style="background: #f3e8ff; color: #7e22ce; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">SMS 📩</span>'
                : '<span style="background: #f1f5f9; color: #475569; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">Manual ✏️</span>';

            const merchantOrComments = tx.comments ? escapeHtml(tx.comments) : '<span style="color: #94a3b8;">—</span>';

            return `
        <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="white-space: nowrap; font-size: 11px; color: #475569;">${dateIST}</td>
          <td style="font-weight: 600; color: #1e293b;">${escapeHtml(tx.category)}</td>
          <td>
            <span style="display: inline-block; padding: 2px 7px; border-radius: 9999px; font-size: 10px; font-weight: 600; ${typeBadgeStyle}">
              ${escapeHtml(tx.expenseType)}
            </span>
          </td>
          <td>${sourceBadge}</td>
          <td style="color: #334155; font-size: 11px; max-width: 180px; word-break: break-word;">${merchantOrComments}</td>
          <td style="text-align: right; font-weight: 700; color: #0f172a; white-space: nowrap;">
            ${formatCurrency(tx.amount, currencySymbol)}
          </td>
        </tr>
      `;
          })
          .join('')
      : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FinTrack Monthly Ledger - ${monthName} ${year}</title>
  <style>
    @page {
      margin: 12mm 14mm 16mm 14mm;
      size: A4 portrait;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
      line-height: 1.45;
      font-size: 12px;
    }
    .header-container {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 800;
      color: #1e3a8a;
      letter-spacing: -0.5px;
      margin: 0 0 4px 0;
    }
    .report-subtitle {
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      margin: 0 0 4px 0;
    }
    .meta-tag {
      font-size: 11px;
      color: #64748b;
    }
    .privacy-seal {
      display: inline-block;
      margin-top: 6px;
      padding: 3px 8px;
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
    }
    .target-period-badge {
      text-align: right;
    }
    .period-title {
      font-size: 20px;
      font-weight: 800;
      color: #2563eb;
      margin: 0;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 22px;
    }
    .metric-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .metric-card.primary {
      background: #eff6ff;
      border-color: #bfdbfe;
    }
    .metric-card.accent {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
    .metric-card.success {
      background: #f0fdf4;
      border-color: #bbf7d0;
    }
    .metric-card.warning {
      background: #fef2f2;
      border-color: #fecaca;
    }
    .metric-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .metric-value {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
    }
    .metric-sub {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #1e293b;
      margin: 20px 0 10px 0;
      display: flex;
      align-items: center;
      gap: 6px;
      border-left: 4px solid #2563eb;
      padding-left: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 10px;
      border-bottom: 2px solid #cbd5e1;
      text-align: left;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 11px;
      color: #1e293b;
    }
    .status-badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .status-badge.on-track {
      background: #dcfce7;
      color: #15803d;
    }
    .status-badge.exceeded {
      background: #fee2e2;
      color: #b91c1c;
    }
    .status-badge.in-progress {
      background: #e0f2fe;
      color: #0369a1;
    }
    .status-badge.no-target {
      background: #f1f5f9;
      color: #64748b;
    }
    .empty-state-box {
      border: 2px dashed #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
      padding: 32px 20px;
      text-align: center;
      margin: 20px 0;
    }
    .empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
    }
    .empty-title {
      font-size: 15px;
      font-weight: 700;
      color: #334155;
      margin-bottom: 4px;
    }
    .empty-desc {
      font-size: 12px;
      color: #64748b;
      margin: 0;
    }
    .footer-container {
      margin-top: 28px;
      padding-top: 14px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: #64748b;
      page-break-inside: avoid;
    }
    .footer-left {
      line-height: 1.4;
    }
    .footer-right {
      text-align: right;
      font-weight: 600;
      color: #1e3a8a;
    }
  </style>
</head>
<body>

  <!-- ── 1. Header ── -->
  <div class="header-container">
    <div>
      <h1 class="brand-title">FinTrack</h1>
      <div class="report-subtitle">Monthly Financial Ledger &amp; Budget Report</div>
      <div class="meta-tag">Generated: ${generatedAtIST}</div>
      <div class="privacy-seal">🔒 Offline Privacy Seal: 100% On-Device Local SQLite • Zero Cloud Sync</div>
    </div>
    <div class="target-period-badge">
      <div class="period-title">${monthName} ${year}</div>
      <div class="meta-tag" style="margin-top: 4px;">Currency: <strong>${currencyCode} (${currencySymbol})</strong></div>
    </div>
  </div>

  <!-- ── 2. Executive Financial Summary Cards ── -->
  <div class="summary-grid">
    <div class="metric-card primary">
      <div class="metric-label">Total Monthly Budget</div>
      <div class="metric-value">${formatCurrency(totalBudget, currencySymbol)}</div>
      <div class="metric-sub">${totalBudget > 0 ? 'Target spending limit' : 'No budget set for month'}</div>
    </div>

    <div class="metric-card accent">
      <div class="metric-label">Total Spent</div>
      <div class="metric-value" style="color: #2563eb;">${formatCurrency(totalSpent, currencySymbol)}</div>
      <div class="metric-sub">${totalTxCount} logged transactions</div>
    </div>

    <div class="metric-card ${isOverBudget ? 'warning' : 'success'}">
      <div class="metric-label">${isOverBudget ? 'Exceeded Amount' : 'Remaining Balance'}</div>
      <div class="metric-value" style="color: ${isOverBudget ? '#dc2626' : '#16a34a'};">
        ${isOverBudget ? formatCurrency(totalSpent - totalBudget, currencySymbol) : formatCurrency(remainingBalance, currencySymbol)}
      </div>
      <div class="metric-sub">${isOverBudget ? 'Over allocated budget' : 'Available cushion'}</div>
    </div>

    <div class="metric-card ${percentUsed > 100 ? 'warning' : 'accent'}">
      <div class="metric-label">% Budget Utilized</div>
      <div class="metric-value" style="color: ${percentUsed > 100 ? '#dc2626' : '#0f172a'};">
        ${totalBudget > 0 ? `${percentUsed}%` : 'N/A'}
      </div>
      <div class="metric-sub">${percentUsed > 100 ? 'Budget breached' : totalBudget > 0 ? 'Within budget bounds' : 'Set budget to track'}</div>
    </div>
  </div>

  <!-- ── 3. Budget Split Allocation Table (50/30/20 Rule) ── -->
  <div class="section-title">📊 50/30/20 Budget Split Allocation</div>
  <table>
    <thead>
      <tr>
        <th style="width: 25%;">Category Bucket</th>
        <th style="text-align: right; width: 25%;">Target Limit</th>
        <th style="text-align: right; width: 25%;">Actual Logged</th>
        <th style="text-align: right; width: 12%;">% Utilized</th>
        <th style="text-align: center; width: 13%;">Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Needs (Essentials)</strong></td>
        <td style="text-align: right;">${formatCurrency(needsLimit, currencySymbol)}</td>
        <td style="text-align: right; font-weight: 600;">${formatCurrency(needsSpent, currencySymbol)}</td>
        <td style="text-align: right;">${needsLimit > 0 ? `${needsPctUsed}%` : '—'}</td>
        <td style="text-align: center;">
          <span class="status-badge ${needsStatus === 'Exceeded' ? 'exceeded' : 'on-track'}">
            ${needsStatus}
          </span>
        </td>
      </tr>
      <tr>
        <td><strong>Wants (Discretionary)</strong></td>
        <td style="text-align: right;">${formatCurrency(wantsLimit, currencySymbol)}</td>
        <td style="text-align: right; font-weight: 600;">${formatCurrency(wantsSpent, currencySymbol)}</td>
        <td style="text-align: right;">${wantsLimit > 0 ? `${wantsPctUsed}%` : '—'}</td>
        <td style="text-align: center;">
          <span class="status-badge ${wantsStatus === 'Exceeded' ? 'exceeded' : 'on-track'}">
            ${wantsStatus}
          </span>
        </td>
      </tr>
      <tr>
        <td><strong>Savings / Investments</strong></td>
        <td style="text-align: right;">${formatCurrency(savingsTarget, currencySymbol)}</td>
        <td style="text-align: right; font-weight: 600;">${formatCurrency(savingsSpent, currencySymbol)}</td>
        <td style="text-align: right;">${savingsTarget > 0 ? `${savingsPctUsed}%` : '—'}</td>
        <td style="text-align: center;">
          <span class="status-badge ${
            savingsStatus === 'Exceeded'
              ? 'on-track'
              : savingsStatus === 'In Progress'
              ? 'in-progress'
              : savingsStatus === 'On Track'
              ? 'on-track'
              : 'no-target'
          }">
            ${savingsStatus === 'Exceeded' ? 'Goal Met' : savingsStatus}
          </span>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- ── 4. Category Breakdown Table ── -->
  <div class="section-title">🏷️ Category Spending Breakdown</div>
  <table>
    <thead>
      <tr>
        <th style="width: 35%;">Category</th>
        <th style="text-align: center; width: 20%;">Transactions</th>
        <th style="text-align: right; width: 25%;">Total Spent</th>
        <th style="text-align: right; width: 20%;">% of Total Expenditure</th>
      </tr>
    </thead>
    <tbody>
      ${categoryRowsHtml}
    </tbody>
  </table>

  <!-- ── 5. Complete Itemized Transaction Ledger ── -->
  <div class="section-title">📜 Complete Itemized Transaction Ledger</div>
  ${
    transactions.length > 0
      ? `
    <table>
      <thead>
        <tr>
          <th style="width: 20%;">Date &amp; Time (IST)</th>
          <th style="width: 17%;">Category</th>
          <th style="width: 13%;">Type</th>
          <th style="width: 12%;">Source</th>
          <th style="width: 22%;">Merchant / Comments</th>
          <th style="text-align: right; width: 16%;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${transactionRowsHtml}
      </tbody>
    </table>
    `
      : `
    <div class="empty-state-box">
      <div class="empty-icon">📂</div>
      <div class="empty-title">0 transactions recorded for this period</div>
      <div class="empty-desc">No expense or savings entries were logged for ${monthName} ${year} in your local FinTrack ledger.</div>
    </div>
    `
  }

  <!-- ── 6. Footer Verification & Privacy Watermark ── -->
  <div class="footer-container">
    <div class="footer-left">
      <div>Total Monthly Entries: <strong>${totalTxCount}</strong></div>
      <div>Verified Ledger Expenditure Sum: <strong>${formatCurrency(totalSpent, currencySymbol)}</strong></div>
    </div>
    <div class="footer-right">
      <div>FinTrack v1.0.2 • Offline-First Personal Finance Tracker</div>
      <div style="font-size: 9px; color: #94a3b8; font-weight: normal; margin-top: 2px;">
        100% Device-Local Financial Privacy
      </div>
    </div>
  </div>

</body>
</html>
`;
}

// --------------- Export Action ---------------

export async function generateMonthlyLedgerPDF(
  options: MonthlyLedgerExportOptions
): Promise<{ uri: string; success: boolean }> {
  try {
    // 1. Compile summary data
    const summaryData = await fetchLedgerDataForMonth(options);

    // 2. Generate styled HTML document
    const html = generateLedgerHTMLTemplate(summaryData);

    // 3. Render HTML to PDF via expo-print
    const file = await Print.printToFileAsync({
      html,
      base64: false,
    });

    // 4. Copy to a user-friendly filename in documents or cache directory
    let targetUri = file.uri;
    try {
      const monthPadded = options.month.toString().padStart(2, '0');
      const safeFilename = `FinTrack_Ledger_${options.year}_${monthPadded}.pdf`;
      const docDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (docDir) {
        const destPath = `${docDir}${safeFilename}`;
        await FileSystem.copyAsync({
          from: file.uri,
          to: destPath,
        });
        targetUri = destPath;
      }
    } catch (fsError) {
      console.warn('[pdfExportService] FileSystem copy warning, fallback to default URI:', fsError);
    }

    // 5. Open native sharing sheet if available
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(targetUri, {
        mimeType: 'application/pdf',
        dialogTitle: `Export Monthly Ledger - ${summaryData.monthName} ${options.year}`,
        UTI: 'com.adobe.pdf',
      });
    }

    return { uri: targetUri, success: true };
  } catch (error) {
    console.error('[pdfExportService] PDF Generation failed:', error);
    throw error;
  }
}
