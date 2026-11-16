import { parseSms } from '../src/services/smsParser';
import { Category, ExpenseType } from '../src/types';

interface TestCase {
  name: string;
  sms: string;
  expected: {
    isDebit: boolean;
    amount?: number | null;
    merchant?: string | null;
    category?: Category;
    expenseType?: ExpenseType;
    rejectionReasonContains?: string;
  };
}

const testCases: TestCase[] = [
  // 1. HDFC UPI
  {
    name: 'HDFC UPI (Swiggy)',
    sms: 'Dear Customer, INR 450.00 debited from A/C **1234 on 15-Nov-2024 to VPA swiggy@hdfcbank (UPI Ref No 432109876543). Avl Bal: INR 12,450.50.',
    expected: {
      isDebit: true,
      amount: 450,
      category: Category.Food,
      expenseType: ExpenseType.Wants,
    },
  },
  // 2. SBI ATM Cash Withdrawal
  {
    name: 'SBI ATM Cash Withdrawal',
    sms: 'Your A/C X6789 Debited for Rs.2500.00 on 14/11/24 at ATM CASH WDL KORMANGALA. Avl Bal Rs:15,320.00 - State Bank of India',
    expected: {
      isDebit: true,
      amount: 2500,
      category: Category.Other,
      expenseType: ExpenseType.Needs,
    },
  },
  // 3. ICICI POS Debit (Amazon)
  {
    name: 'ICICI POS Debit (Amazon)',
    sms: 'Dear Customer, your Acct XX9012 is debited for Rs 1,299.00 on 13-Nov-24. Info: INF*AMAZON*123. Avail Bal is Rs 45,210.00.',
    expected: {
      isDebit: true,
      amount: 1299,
      category: Category.Shopping,
      expenseType: ExpenseType.Wants,
    },
  },
  // 4. Axis Card Swipe (Blinkit)
  {
    name: 'Axis Card Swipe (Blinkit)',
    sms: 'Transaction Alert: INR 650.00 debited from Axis Bank Card ending 3456 on 15-Nov-24 at Blinkit. Avail Limit: 48,000.',
    expected: {
      isDebit: true,
      amount: 650,
      category: Category.Groceries,
      expenseType: ExpenseType.Needs,
    },
  },
  // 5. PhonePe UPI (McDonald's)
  {
    name: 'PhonePe UPI (McDonald\'s)',
    sms: "Paid Rs.320 to McDonald's on PhonePe using HDFC Bank (XX4321). UPI Ref: 432190876543.",
    expected: {
      isDebit: true,
      amount: 320,
      category: Category.Food,
      expenseType: ExpenseType.Wants,
    },
  },
  // 6. Entertainment (Netflix)
  {
    name: 'Entertainment (Netflix)',
    sms: 'Dear Customer, INR 649.00 debited from ICICI Bank Card ending 9876 on 15-Nov-24 towards Netflix. Avail Bal: INR 32,500.00',
    expected: {
      isDebit: true,
      amount: 649,
      category: Category.Entertainment,
      expenseType: ExpenseType.Wants,
    },
  },
  // 7. Healthcare (Apollo Pharmacy)
  {
    name: 'Healthcare (Apollo Pharmacy)',
    sms: 'Sent Rs. 890.00 from Kotak Bank AC XX8901 to Apollo Pharmacy UPI ref 432156789012.',
    expected: {
      isDebit: true,
      amount: 890,
      category: Category.Healthcare,
      expenseType: ExpenseType.Needs,
    },
  },
  // 8. Utilities (BESCOM Electricity)
  {
    name: 'Utilities (BESCOM Electricity)',
    sms: 'Dear Customer, A/C *1234 debited for Rs 1500.00 on 14-Nov-24 by transfer to BESCOM Electricity. Avl Bal: Rs 8950.00 - PNB',
    expected: {
      isDebit: true,
      amount: 1500,
      category: Category.Utilities,
      expenseType: ExpenseType.Needs,
    },
  },
  // 9. OTP Rejection Test
  {
    name: 'OTP Rejection',
    sms: '482910 is your secret OTP for transaction of INR 1,500.00 on Flipkart. Do not share OTP with anyone.',
    expected: {
      isDebit: false,
      amount: null,
      rejectionReasonContains: 'OTP',
    },
  },
  // 10. Promo Spam Rejection Test
  {
    name: 'Promo Spam Rejection',
    sms: 'Congratulations! You are pre-approved for an instant personal loan of up to Rs 5,00,000 with zero interest. Apply now.',
    expected: {
      isDebit: false,
      amount: null,
      rejectionReasonContains: 'Promotional',
    },
  },
  // 11. Credit Notification Rejection Test
  {
    name: 'Salary Credit Rejection',
    sms: 'Dear Customer, your A/C XX5432 has been credited with INR 75,000.00 on 01-Nov-2024 towards Salary. Avl Bal: INR 82,300.00.',
    expected: {
      isDebit: false,
      amount: null,
    },
  },
  // 12. Cashback Received Rejection Test
  {
    name: 'Cashback Received Rejection',
    sms: 'Cashback received! Rs 50.00 credited to your wallet for transaction at Google Pay.',
    expected: {
      isDebit: false,
      amount: null,
    },
  },
  // 13. Bill Due Reminder Rejection Test
  {
    name: 'Credit Card Bill Due Rejection',
    sms: 'Reminder: Total amount due on your Credit Card ending 8765 is INR 4,320.00. Payment is due by 20-Nov-2024.',
    expected: {
      isDebit: false,
      amount: null,
    },
  },
  // 14. Uber Ride (Travel)
  {
    name: 'Uber Ride (Travel)',
    sms: 'Paid Rs.285.00 to Uber India via Paytm UPI for ride from HDFC Bank A/C XX1234.',
    expected: {
      isDebit: true,
      amount: 285,
      category: Category.Travel,
      expenseType: ExpenseType.Needs,
    },
  },
];

console.log('--- Starting SMS Parser Test Suite ---');
let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = parseSms(tc.sms);
  let errorMsg = '';

  if (result.isDebit !== tc.expected.isDebit) {
    errorMsg += ` Expected isDebit=${tc.expected.isDebit}, got ${result.isDebit}.`;
  }
  if (tc.expected.amount !== undefined && result.amount !== tc.expected.amount) {
    errorMsg += ` Expected amount=${tc.expected.amount}, got ${result.amount}.`;
  }
  if (tc.expected.category !== undefined && result.category !== tc.expected.category) {
    errorMsg += ` Expected category=${tc.expected.category}, got ${result.category}.`;
  }
  if (tc.expected.expenseType !== undefined && result.expenseType !== tc.expected.expenseType) {
    errorMsg += ` Expected expenseType=${tc.expected.expenseType}, got ${result.expenseType}.`;
  }
  if (
    tc.expected.rejectionReasonContains &&
    (!result.rejectionReason || !result.rejectionReason.toLowerCase().includes(tc.expected.rejectionReasonContains.toLowerCase()))
  ) {
    errorMsg += ` Expected rejectionReason containing '${tc.expected.rejectionReasonContains}', got '${result.rejectionReason}'.`;
  }

  if (errorMsg) {
    console.error(`FAIL: [${tc.name}] - ${errorMsg}`);
    console.error(`  Result:`, JSON.stringify(result, null, 2));
    failed++;
  } else {
    console.log(`PASS: [${tc.name}] (isDebit: ${result.isDebit}, amount: ${result.amount}, category: ${result.category}, confidence: ${result.confidence})`);
    passed++;
  }
}

console.log(`\nTest Summary: ${passed} Passed, ${failed} Failed out of ${testCases.length} tests.`);
if (failed > 0) {
  process.exit(1);
}
