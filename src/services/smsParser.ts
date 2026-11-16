// ============================================================
// src/services/smsParser.ts
// Comprehensive Indian Bank & UPI SMS Parser Engine
// Parses debit alerts from SBI, HDFC, ICICI, Axis, Kotak, PNB,
// Bank of Baroda, IndusInd, and UPI apps (GPay, PhonePe, Paytm, CRED)
// Filters out OTPs, promotional SMS, credit alerts, spam.
// ============================================================

import { Category, ExpenseType } from '@/types';

// --------------- Types ---------------

export interface ParsedSmsResult {
  isDebit: boolean;
  amount: number | null;
  merchant: string | null;
  accountRef: string | null;
  category: Category;
  expenseType: ExpenseType;
  rawSms: string;
  bankName: string | null;
  confidence: 'high' | 'medium' | 'low';
  rejectionReason?: string;
}

// --------------- Keywords & Regexes ---------------

// Non-debit filters: OTPs, Promos, Credits, Balances
const OTP_REGEX = /\b(?:otp|one[- ]time[- ]password|verification code|secret code|auth code)\b/i;
const OTP_WARNING_REGEX = /\b(?:do not share|never share|don't share|not to be shared)\b/i;

const PROMO_KEYWORDS = [
  'pre-approved',
  'apply now',
  'flat \\d+%',
  'special offer',
  'discount code',
  'claim now',
  'win up to',
  'congratulations',
  'exclusive offer',
  'click here',
  'zero interest',
  'personal loan',
  'credit card offer',
];
const PROMO_REGEX = new RegExp(`\\b(?:${PROMO_KEYWORDS.join('|')})\\b`, 'i');

const CREDIT_REGEX = /\b(?:credited with|credited to|credited for|has been credited|is credited|deposited|received rs\.?|refund of|cashback received)\b/i;

const BILL_DUE_REGEX = /\b(?:bill generated|due date|payment is due|minimum amount due|total amount due|reminder to pay)\b/i;

// Debit indicators
const DEBIT_KEYWORDS_REGEX = /\b(?:debited|debited for|debited by|debited with|debited from|paid|spent|withdrawn|sent|transferred to|transfer to|transfer of|payment of|payment to|purchased at|purchase of|txn of|transaction of|deducted|auto[- ]debited|charged|swiped at|swiped for|used at|used on)\b/i;

// Regex patterns to extract amount explicitly associated with debit/payment
const DEBIT_AMOUNT_PATTERNS = [
  // "INR 450.00 debited" / "Rs. 1,299.00 debited" / "₹450 debited" / "deducted"
  /(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:has\s+been\s+|is\s+|was\s+)?(?:debited|deducted|transferred|spent|withdrawn|paid)/i,
  // "debited for/by/with/of INR 450.00" / "debited Rs. 450.00" / "deducted"
  /(?:debited|deducted)\s*(?:for|by|with|of)?\s*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Paid Rs.320 to" / "Paid ₹850 to" / "paid INR 500"
  /paid\s*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Payment of Rs 250" / "Payment to ... of Rs 250"
  /payment(?:\s+to\s+[^,\n]+?)?\s+of\s+(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "spent Rs. 500" / "spent INR 500" / "spent ₹500"
  /spent\s*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Sent Rs. 420.00" / "sent INR 450"
  /sent\s*(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "withdrawn Rs. 2500" / "WDL ... Rs.2500"
  /(?:withdrawn|wdl)\s*(?:for|of)?\s*(?:inr|rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Rs 599.00 debited/spent/withdrawn/transferred/deducted"
  /(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:spent|transferred|withdrawn|paid|deducted)/i,
  // Fallback debit pattern: "debited ... Rs 500"
  /(?:debited|deducted)[^\d\n\r]{0,30}(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  // General fallback if debit context confirmed: "(INR|Rs|₹) 500.00"
  /(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
];

// Regex patterns to extract recipient / merchant name
const MERCHANT_PATTERNS = [
  // "Paid Rs.X to <Merchant> on/using/via/through"
  /paid\s+(?:inr|rs\.?|₹)?\s*[\d,]+(?:\.\d{1,2})?\s+to\s+([^,\n.]+?)(?:\s+(?:on|via|using|through|ref|upi|with|from|card)|[.\n,]|$)/i,
  // "to VPA <merchant>@<bank>"
  /(?:to\s+vpa|vpa)\s+([a-zA-Z0-9.\-_]+)(?:@[\w.]+)?/i,
  // "Info: INF*<merchant>*<id>"
  /info:\s*(?:inf\*)?([^*.\n,]+)/i,
  // "towards <Merchant> (on/at/ref/upi/avl/bal)"
  /towards\s+([^,\n.]+?)(?:\s+(?:on|at|ref|upi|avl|bal|avail)|[.\n,]|$)/i,
  // "transfer to <Merchant> (on/ref/upi/bal)"
  /transfer\s+to\s+([^,\n.]+?)(?:\s+(?:on|ref|upi|avl|bal|avail)|[.\n,]|$)/i,
  // "by transfer to <Merchant>"
  /by\s+(?:transfer\s+to|upi\s+to)\s+([^,\n.]+?)(?:\s+(?:on|ref|upi|avl|bal|avail)|[.\n,]|$)/i,
  // "to <Merchant> UPI ref" / "to <Merchant> ref"
  /to\s+([^,\n.]+?)(?:\s+(?:upi\s+ref|ref\s+no|ref\b|via|on\s+\d)|[.\n,]|$)/i,
  // "at <Merchant> on/ref/avl"
  /at\s+([^,\n.]+?)(?:\s+(?:on|ref|avl|bal|avail|ending|dated)|[.\n,]|$)/i,
];

// Regex patterns to extract account / card reference
const ACCOUNT_PATTERNS = [
  // "A/C **1234" / "A/C XX1234" / "A/c ending 1234"
  /(?:a\/c|acct|account|card)\s*(?:no\.?)?\s*(?:ending\s+)?([x*]+[\d]{3,4}|\b\d{4}\b)/i,
  // "Card ending 5678"
  /card\s+ending\s+(\d{4})/i,
  // "ending 1234" / "ending in 1234"
  /ending\s+(?:in\s+)?(\d{4})/i,
  // Masked account format: "XX1234", "**1234", "X6789"
  /\b([x*]{1,4}\d{4})\b/i,
  // "(XX1234)" or "(**1234)"
  /\(([x*]+)?(\d{4})\)/i,
];

// Bank identifier mappings
const BANK_MATCHERS: { name: string; pattern: RegExp }[] = [
  { name: 'HDFC Bank', pattern: /\b(hdfc|hdfcbank)\b/i },
  { name: 'SBI', pattern: /\b(sbi|state bank of india)\b/i },
  { name: 'ICICI Bank', pattern: /\b(icici|icicibank)\b/i },
  { name: 'Axis Bank', pattern: /\b(axis|axisbank)\b/i },
  { name: 'Kotak Bank', pattern: /\b(kotak|kotakbank)\b/i },
  { name: 'PNB', pattern: /\b(pnb|punjab national bank)\b/i },
  { name: 'Bank of Baroda', pattern: /\b(bob|bank of baroda)\b/i },
  { name: 'IndusInd Bank', pattern: /\b(indusind|indusindbank)\b/i },
  { name: 'Canara Bank', pattern: /\b(canara|canarabank)\b/i },
  { name: 'Union Bank', pattern: /\b(union bank|uboi)\b/i },
  { name: 'Google Pay', pattern: /\b(google pay|gpay)\b/i },
  { name: 'PhonePe', pattern: /\b(phonepe)\b/i },
  { name: 'Paytm', pattern: /\b(paytm)\b/i },
  { name: 'CRED', pattern: /\b(cred)\b/i },
];

// --------------- Smart Category Heuristic ---------------

interface CategoryRule {
  category: Category;
  expenseType: ExpenseType;
  keywords: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: Category.Food,
    expenseType: ExpenseType.Wants,
    keywords: [
      'swiggy',
      'zomato',
      "mcdonald's",
      'mcdonalds',
      'starbucks',
      'eatclub',
      "domino's",
      'dominos',
      'pizza hut',
      'burger king',
      'kfc',
      'subway',
      'chai point',
      'chaayos',
      'cafe coffee day',
      'ccd',
      'barbeque nation',
      'haldiram',
      'bikanervala',
      'food',
      'restaurant',
      'dining',
      'bakery',
      'cafe',
      'kitchen',
      'eats',
    ],
  },
  {
    category: Category.Groceries,
    expenseType: ExpenseType.Needs,
    keywords: [
      'blinkit',
      'zepto',
      'bigbasket',
      'instamart',
      "nature's basket",
      'natures basket',
      'dmart',
      'spencers',
      'reliance fresh',
      'more retail',
      'supermarket',
      'grocery',
      'kirana',
      'vegetable',
      'fruits',
      'milk',
      'country delight',
    ],
  },
  {
    category: Category.Travel,
    expenseType: ExpenseType.Needs,
    keywords: [
      'uber',
      'ola',
      'rapido',
      'metro',
      'irctc',
      'makemytrip',
      'indigo',
      'air india',
      'vistara',
      'spicejet',
      'akasa',
      'goibibo',
      'yatra',
      'cleartrip',
      'redbus',
      'abhibus',
      'travel',
      'cabs',
      'flight',
      'railways',
      'toll',
      'fastag',
      'petrol',
      'fuel',
      'indian oil',
      'hpcl',
      'bpcl',
    ],
  },
  {
    category: Category.Entertainment,
    expenseType: ExpenseType.Wants,
    keywords: [
      'netflix',
      'spotify',
      'bookmyshow',
      'prime video',
      'hotstar',
      'disney',
      'youtube',
      'pvr',
      'inox',
      'cinema',
      'movies',
      'theatre',
      'gaming',
      'playstation',
      'steam',
      'apple music',
      'wynk',
      'gaana',
      'jiosaavn',
      'audible',
      'sonyliv',
      'zee5',
    ],
  },
  {
    category: Category.Healthcare,
    expenseType: ExpenseType.Needs,
    keywords: [
      'apollo',
      'pharmeasy',
      '1mg',
      'practo',
      'hospital',
      'clinic',
      'medplus',
      'pharmacy',
      'diagnostic',
      'pathology',
      'dr lal',
      'metropolis',
      'max healthcare',
      'fortis',
      'manipal',
      'chemist',
      'medical',
    ],
  },
  {
    category: Category.Utilities,
    expenseType: ExpenseType.Needs,
    keywords: [
      'electricity',
      'bescom',
      'adani',
      'water',
      'gas',
      'airtel',
      'jio',
      'vi',
      'vodafone',
      'tata play',
      'act fibernet',
      'hathway',
      'broadband',
      'bill desk',
      'billdesk',
      'tneb',
      'mseb',
      'uppcl',
      'cesc',
      'indane',
      'bharat gas',
      'hp gas',
      'utility',
    ],
  },
  {
    category: Category.Shopping,
    expenseType: ExpenseType.Wants,
    keywords: [
      'amazon',
      'flipkart',
      'myntra',
      'zara',
      'h&m',
      'hnm',
      'ajio',
      'nykaa',
      'meesho',
      'tata cliq',
      'reliancedigital',
      'croma',
      'decathlon',
      'ikea',
      'uniqlo',
      'lifestyle',
      'shoppers stop',
      'shopping',
      'retail',
    ],
  },
  {
    category: Category.EMI,
    expenseType: ExpenseType.Needs,
    keywords: [
      'emi',
      'loan',
      'bajaj finance',
      'hdb financial',
      'home loan',
      'car loan',
      'personal loan emi',
    ],
  },
  {
    category: Category.Rent,
    expenseType: ExpenseType.Needs,
    keywords: [
      'rent',
      'nobroker',
      'house rent',
      'flat rent',
    ],
  },
];

// --------------- Helper Functions ---------------

/**
 * Checks if the SMS is an OTP, promotional spam, pure credit alert, or balance enquiry
 */
export function isNonDebitOrSpam(text: string): { isRejected: boolean; reason?: string } {
  // 1. Check OTP (even if it mentions an amount, OTPs must never be logged as transactions)
  if (OTP_REGEX.test(text) || OTP_WARNING_REGEX.test(text)) {
    return { isRejected: true, reason: 'OTP / Verification Code' };
  }

  // 2. Check Promotional Spam
  if (PROMO_REGEX.test(text)) {
    return { isRejected: true, reason: 'Promotional / Marketing SMS' };
  }

  // 3. Check Bill Due Reminder without debit
  if (BILL_DUE_REGEX.test(text) && !DEBIT_KEYWORDS_REGEX.test(text)) {
    return { isRejected: true, reason: 'Bill Due Reminder' };
  }

  // 4. Check Pure Credit Alert (Salary, refunds, cashbacks) unless it also has debit keywords
  if (CREDIT_REGEX.test(text) && !DEBIT_KEYWORDS_REGEX.test(text)) {
    return { isRejected: true, reason: 'Credit Alert' };
  }

  // 5. Check Balance Enquiry without debit
  if (/\b(?:available balance|avl bal|bal is|balance in your account)\b/i.test(text) && !DEBIT_KEYWORDS_REGEX.test(text)) {
    return { isRejected: true, reason: 'Balance Enquiry' };
  }

  // 6. Must have at least one debit indicator
  if (!DEBIT_KEYWORDS_REGEX.test(text)) {
    return { isRejected: true, reason: 'Non-debit SMS (no debit indicator found)' };
  }

  return { isRejected: false };
}

/**
 * Extracts and cleans the debit amount
 */
export function extractAmount(text: string): number | null {
  for (const pattern of DEBIT_AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const cleanStr = match[1].replace(/,/g, '').trim();
      const num = parseFloat(cleanStr);
      if (!isNaN(num) && num > 0) {
        return num;
      }
    }
  }
  return null;
}

const KNOWN_ACRONYMS = new Set([
  'ATM',
  'IRCTC',
  'BESCOM',
  'KFC',
  'PNB',
  'BOB',
  'UPI',
  'POS',
  'WDL',
  'EMI',
  'CCD',
  'PVR',
  'INOX',
  'TNEB',
  'MSEB',
  'UPPCL',
  'CESC',
  'HPCL',
  'BPCL',
  'DMART',
]);

/**
 * Normalizes merchant name into clean format, preserving acronyms and title casing.
 */
function cleanMerchantName(raw: string): string {
  let cleaned = raw
    .replace(/^[@/.*#_-]+|[@/.*#_-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip VPA domains (e.g. swiggy@hdfcbank -> swiggy)
  if (cleaned.includes('@')) {
    cleaned = cleaned.split('@')[0];
  }

  // Strip trailing noise like "UPI", "VPA", "Ref", "A/C"
  cleaned = cleaned.replace(/\b(?:upi|vpa|ref|no|utr|ltd|pvt|corp)\b/gi, '').trim();

  // Title case words while respecting known acronyms & brand capitalization
  if (cleaned.length > 0) {
    cleaned = cleaned
      .split(' ')
      .filter((w) => w.length > 0)
      .map((w) => {
        const upper = w.toUpperCase();
        if (KNOWN_ACRONYMS.has(upper)) {
          return upper;
        }
        // Preserve brands like McDonald's
        if (/^mc[a-z]+/i.test(w)) {
          return 'Mc' + w.charAt(2).toUpperCase() + w.slice(3);
        }
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(' ');
  }

  return cleaned || 'Unknown';
}

/**
 * Extracts merchant/recipient from SMS text
 */
export function extractMerchant(text: string): string | null {
  for (const pattern of MERCHANT_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Ensure candidate doesn't match a generic word like "Your" or "Account"
      if (candidate.length >= 2 && !/^(?:your|the|a|an|acct|account|card|ending)$/i.test(candidate)) {
        return cleanMerchantName(candidate);
      }
    }
  }

  // Fallback: check if any known merchant keyword is directly present in text
  const lower = text.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (kw.length > 3 && lower.includes(kw)) {
        return cleanMerchantName(kw);
      }
    }
  }

  return null;
}

/**
 * Extracts account/card reference ending digits (e.g. "XX1234")
 */
export function extractAccountRef(text: string): string | null {
  for (const pattern of ACCOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Find the matched group with digits
      const digitsPart = match[2] || match[1];
      if (digitsPart) {
        const lastDigits = digitsPart.replace(/\D/g, '');
        if (lastDigits.length >= 3) {
          return `XX${lastDigits.slice(-4)}`;
        }
      }
    }
  }
  return null;
}

/**
 * Detects issuing Bank or UPI Provider
 */
export function extractBankName(text: string): string | null {
  for (const bank of BANK_MATCHERS) {
    if (bank.pattern.test(text)) {
      return bank.name;
    }
  }
  return null;
}

/**
 * Smart Category & ExpenseType Heuristic:
 * Categorizes transaction based on merchant name and SMS context.
 * Default fallback: Category.Other, ExpenseType.Needs
 */
export function categorizeTransaction(
  merchant: string | null,
  rawSms: string
): { category: Category; expenseType: ExpenseType } {
  const textToScan = `${merchant || ''} ${rawSms}`.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      // Word boundary check or substring check for known brand names
      const regex = new RegExp(`\\b${keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (regex.test(textToScan) || textToScan.includes(keyword)) {
        return {
          category: rule.category,
          expenseType: rule.expenseType,
        };
      }
    }
  }

  // Default fallback: Other (Needs) as specified in requirements
  return {
    category: Category.Other,
    expenseType: ExpenseType.Needs,
  };
}

// --------------- Main Parser Function ---------------

/**
 * Parses raw SMS text and returns structured debit transaction result.
 */
export function parseSms(rawSms: string): ParsedSmsResult {
  const normalizedSms = rawSms.trim();

  // 1. Run rejection filters
  const filterCheck = isNonDebitOrSpam(normalizedSms);
  if (filterCheck.isRejected) {
    return {
      isDebit: false,
      amount: null,
      merchant: null,
      accountRef: null,
      category: Category.Other,
      expenseType: ExpenseType.Needs,
      rawSms: normalizedSms,
      bankName: extractBankName(normalizedSms),
      confidence: 'low',
      rejectionReason: filterCheck.reason,
    };
  }

  // 2. Extract Amount
  const amount = extractAmount(normalizedSms);
  if (!amount || amount <= 0) {
    return {
      isDebit: false,
      amount: null,
      merchant: null,
      accountRef: null,
      category: Category.Other,
      expenseType: ExpenseType.Needs,
      rawSms: normalizedSms,
      bankName: extractBankName(normalizedSms),
      confidence: 'low',
      rejectionReason: 'Unable to extract valid debit amount',
    };
  }

  // 3. Extract Merchant
  const merchant = extractMerchant(normalizedSms);

  // 4. Extract Account Ref
  const accountRef = extractAccountRef(normalizedSms);

  // 5. Detect Bank
  const bankName = extractBankName(normalizedSms);

  // 6. Smart Categorization
  const { category, expenseType } = categorizeTransaction(merchant, normalizedSms);

  // 7. Calculate confidence
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  if (amount && merchant && accountRef) {
    confidence = 'high';
  } else if (!merchant) {
    confidence = 'low';
  }

  return {
    isDebit: true,
    amount,
    merchant: merchant || (bankName ? `${bankName} Debit` : 'Debit Transaction'),
    accountRef,
    category,
    expenseType,
    rawSms: normalizedSms,
    bankName,
    confidence,
  };
}
