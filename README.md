# FinTrack 📱💰

> **Offline-First Android Personal Finance Tracker**  
> Engineered for financial discipline, total data sovereignty, and zero-cloud dependency. Built with **React Native**, **Expo SDK 52**, **WatermelonDB (SQLite)**, **Zustand**, and **NativeWind v4**.

---

## 📑 Table of Contents

- [Architectural Overview](#-architectural-overview)
- [Key Features](#-key-features)
- [Screens & Navigation Flow](#-screens--navigation-flow)
- [Database Schema & State Architecture](#-database-schema--state-architecture)
- [Setup & Local Development](#-setup--local-development)
- [Android Build & Sideloading](#-android-build--sideloading)
- [Testing SMS Parsing Offline](#-testing-sms-parsing-offline)
- [Edge Case Safeguards & Risk Register](#-edge-case-safeguards--risk-register)
- [Privacy & Offline Security Declaration](#-privacy--offline-security-declaration)

---

## 🏛️ Architectural Overview

FinTrack operates under a strict **100% Offline-First Paradigm**. The application does not require an active internet connection, user accounts, authentication servers, or external telemetry. All financial data is held exclusively in an encrypted on-device SQLite container.

```
                      ┌───────────────────────────────────────┐
                      │            UI / Screens               │
                      │  (NativeWind v4 + Expo Router v4)     │
                      └──────────────────┬────────────────────┘
                                         │ Reactive Binding
                                         ▼
                      ┌───────────────────────────────────────┐
                      │            Zustand Stores             │
                      │ (Transactions, Budget, Settings, Rec) │
                      └──────────────────┬────────────────────┘
                                         │ Observers / Writes
                                         ▼
                      ┌───────────────────────────────────────┐
                      │          WatermelonDB Engine          │
                      │  (Reactive Observables + JSI Cache)   │
                      └──────────────────┬────────────────────┘
                                         │ Direct Driver
                                         ▼
                      ┌───────────────────────────────────────┐
                      │          Local SQLite DB              │
                      │ (100% On-Device Sandboxed Storage)    │
                      └───────────────────────────────────────┘
```

- **WatermelonDB**: High-performance, lazy-loaded reactive database built on top of native SQLite via JSI. Scales effortlessly to tens of thousands of transactions with instant launch times.
- **Zustand**: Lightweight global state management hydrated directly from WatermelonDB observables, ensuring seamless UI synchronization across all screens.
- **NativeWind v4**: High-speed utility styling engine translating Tailwind CSS primitives directly into native React Native styling stylesheets.
- **Expo SDK 52 + Expo Router v4**: Typed file-based routing architecture with seamless bottom tab navigation, slide-up modal bottom sheets, and native screen animations.

---

## ✨ Key Features

### 1. 📩 Automated Bank & UPI Debit SMS Ingestion
- Automatically parses incoming transactional debit SMS messages from leading Indian financial institutions (**HDFC, SBI, ICICI, Axis, Kotak, PNB, Bank of Baroda, IndusInd**) and UPI handles (**Google Pay, PhonePe, Paytm, CRED**).
- **Anti-Junk Shield**: Multi-stage regex parser automatically discards OTPs, one-time passwords, promotional offers, salary credits, cashback notifications, and balance enquiries.
- **Smart Categorization**: Keyword classification engine maps merchants (e.g. Swiggy, Netflix, Blinkit, Apollo Pharmacy, Uber, BESCOM) into predefined expense buckets with automatic Needs/Wants attribution.

### 2. 📊 50/30/20 Budgeting Engine
- Allocates monthly budgets into **Needs (50%)**, **Wants (30%)**, and **Savings (20%)** or customizable ratios (e.g., 60/20/20, 70/20/10).
- Strict 100% sum verification with an **Auto-Normalize** helper button.
- Real-time limit enforcement with warning banners and push notifications when category or total monthly limits are breached.

### 3. 🌙 Daily Evening Ledger Review Reminders
- Scheduled local push notification (default **8:00 PM / 20:00 IST**, user-configurable) reminding users to audit daily spending and record any unlogged cash transactions before bedtime.
- Computes today's logged spending dynamically in the notification message body.

### 4. 📅 Recurring Bills & Subscription Reminders
- Manages monthly commitments (Rent, Netflix, Broadband, EMIs, Gym) with configurable advance warning alerts (e.g., 1, 2, 3, or 5 days before due date at 9:00 AM IST).
- **Short-Month Clamping**: Due dates scheduled on the 29th, 30th, or 31st automatically clamp to the final calendar day of shorter months (e.g., February 28/29, April 30).

### 5. 📄 Monthly Ledger PDF Export
- Generates print-ready executive monthly financial statements using `expo-print` and `expo-sharing`.
- Formatted with an executive summary, 50/30/20 allocation audit, category expenditure table with proportion bars, and a complete itemized transaction ledger.
- Synthesized 100% on-device with zero server involvement.

### 6. 🌐 Global Currency Switching
- Instant toggle between global currencies: **INR (₹)**, **USD ($)**, **EUR (€)**, **GBP (£)**, **JPY (¥)**, **AUD (A$)**, **CAD (C$)**, and **AED (AED)**.
- Dynamically updates all ledger calculations, counters, progress bars, and `CurrencyText` instances across every screen in real time.

### 7. 🧪 Offline SMS Simulator
- Built-in developer and user testing suite with pre-loaded real-world bank SMS templates (HDFC UPI, SBI ATM, ICICI POS, Axis Card, PhonePe UPI, OTP rejection test, Promotional spam rejection test).
- Test parser accuracy, live preview extracted fields (amount, merchant, account ref, category, confidence), and simulate auto-logging without needing a real SIM card or carrier connection.

### 8. 💾 Data & Storage Management
- Real-time database metrics showing SQLite transaction count, recurring bill count, and estimated on-device footprint.
- One-tap JSON database export and sharing for external backups.
- Safe two-step permanent database wipe and factory reset.

---

## 📱 Screens & Navigation Flow

FinTrack uses Expo Router v4 with a 4-tab bottom navigation bar and 2 slide-up bottom-sheet modals:

```
app/
├── _layout.tsx                     # Root layout, DB initialization, WatermelonDB observers
├── (tabs)/
│   ├── _layout.tsx                 # Tab navigator bar configuration
│   ├── index.tsx                   # [Tab 1] Home Dashboard (Live counter, Pie chart, Budget bars, Recent list)
│   ├── transactions.tsx            # [Tab 2] Transaction Ledger (Filters: Today, Week, Month, Custom date range)
│   ├── budget.tsx                  # [Tab 3] Budget Configuration (50/30/20 Stepper, Recurring bills list)
│   └── settings.tsx                # [Tab 4] Settings & Tools (Currency, PDF Export, SMS, Notification time, Wipe)
└── modals/
    ├── add-transaction.tsx         # [Modal] Add / Edit Manual Transaction (Zod validated, Category pill picker)
    └── add-recurring.tsx           # [Modal] Add / Edit Recurring Bill (Due day 1-31, Advance notification selector)
```

---

## 🗄️ Database Schema & State Architecture

### WatermelonDB Tables (`src/db/schema.ts`)

| Table | Columns | Indices | Purpose |
| :--- | :--- | :--- | :--- |
| **`transactions`** | `amount`, `category`, `expense_type`, `source`, `comments`, `timestamp`, `raw_sms`, `created_at`, `updated_at` | `amount`, `category`, `expense_type`, `timestamp` | Itemized ledger records (manual and SMS auto-detected) |
| **`budgets`** | `month`, `total_budget`, `needs_pct`, `wants_pct`, `savings_pct`, `created_at`, `updated_at` | `month` (`YYYYMM`) | Monthly budget allocations and 50/30/20 splits |
| **`recurring_payments`** | `name`, `amount`, `category`, `expense_type`, `due_day`, `notify_days_before`, `is_active`, `created_at`, `updated_at` | — | Recurring bills, subscriptions, and EMIs |
| **`settings`** | `currency_symbol`, `currency_code`, `notification_time`, `sms_permission_granted`, `notifications_enabled`, `created_at`, `updated_at` | — | Global app configuration and preferences |

---

## 🚀 Setup & Local Development

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **yarn**
- **Android Studio** (with Android SDK platform-tools) or **Expo Go** app on an Android device

### Installation
```bash
# 1. Clone the repository
git clone https://github.com/your-username/FinTrack.git
cd FinTrack

# 2. Install dependencies
npm install

# 3. Start Expo development server
npx expo start
```

### Running on Android
```bash
# Run on connected Android device or Android Emulator
npx expo start --android
```

---

## 📦 Android Build & Sideloading

FinTrack includes native Android permissions (`RECEIVE_SMS`, `READ_SMS`, `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`) declared in `app.json`.

### Option A: Local Native Debug / Release Build
```bash
# Generate native Android project and compile
npx expo run:android

# Or generate a release APK directly
npx expo run:android --variant release
```

### Option B: Cloud APK Generation with EAS Build (Recommended for Sideloading)
```bash
# 1. Install EAS CLI globally
npm install -g eas-cli

# 2. Log in to your Expo account
eas login

# 3. Configure project (if not already initialized)
eas build:configure

# 4. Trigger preview APK build (installable standalone APK)
eas build -p android --profile preview
```

### Sideloading via ADB
Once the `.apk` file is downloaded:
```bash
# Enable USB Debugging on your Android device and run:
adb devices
adb install -r FinTrack-preview.apk
```

---

## 🧪 Testing SMS Parsing Offline

FinTrack includes an **SMS Parser Simulator** accessible directly from **Settings → SMS Auto-Detection → SMS Parser Simulator**:

1. Tap **"Open Tool"** in the Settings tab.
2. Select any pre-configured 1-tap preset:
   - **HDFC UPI (Swiggy)**: Tests UPI VPA parsing (`₹450`, `Food`, `Wants`).
   - **SBI ATM Withdrawal**: Tests ATM cash withdrawal debit (`₹2,500`, `Other`, `Needs`).
   - **ICICI POS (Amazon)**: Tests POS merchant debit (`₹1,299`, `Shopping`, `Wants`).
   - **Axis Card (Blinkit)**: Tests card swipe grocery debit (`₹650`, `Groceries`, `Needs`).
   - **PhonePe UPI (McDonald's)**: Tests PhonePe payment (`₹320`, `Food`, `Wants`).
   - **OTP Test (Flipkart)**: Demonstrates that OTPs are **rejected** with reason *"OTP / Verification Code"*.
   - **Promo Spam**: Demonstrates that marketing SMS is **rejected** with reason *"Promotional / Marketing SMS"*.
3. Verify the **Live Parser Preview** displays the exact extracted amount, merchant, category, and confidence rating.
4. Tap **"Simulate & Auto-Log Expense"** to write the transaction directly to the local ledger and observe real-time budget updates.

---

## 🛡️ Edge Case Safeguards & Risk Register

| Edge Case | Failure Mode Addressed | FinTrack Safeguard |
| :--- | :--- | :--- |
| **Zero Transactions** | `NaN%`, division-by-zero crashes in pie chart and counters | Radial segments render empty neutral ring (`#e2e8f0`); pie chart center displays friendly empty state; counter shows `0.00`; PDF export displays clean *"0 transactions recorded"* message without crashing. |
| **No Budget Set** | Missing monthly limit calculation | Store defaults limits to 0; progress bar displays *"Set your budget →"* prompt; summary cards show *"No budget set"* without dividing by zero. |
| **Month Rollover** | Mixed historical data during calendar turnover | WatermelonDB and Zustand filter strictly by `YYYYMM` (IST-aware timestamps); new months initialize cleanly with default templates. |
| **SMS Permission Denied** | App crash or disabled core functionality | Gracefully degrades to 100% manual entry; settings toggle reflects inactive state; simulator remains fully accessible for offline testing. |
| **Short-Month Clamping** | Invalid dates (e.g. Feb 30th) triggering runtime errors | Recurring bills due on the 29th, 30th, or 31st automatically clamp to the final day of the target month via `new Date(year, month + 1, 0).getDate()`. |
| **Currency Switching** | Stale currency symbols remaining in nested views | `CurrencyText` listens directly to `useSettingsStore`; changing currency in Settings instantly updates every visible component across all tabs without app restart. |

---

## 🔒 Privacy & Offline Security Declaration

1. **Zero Outbound Telemetry**: FinTrack contains **no third-party tracking SDKs**, analytics beacons, or remote database connections.
2. **On-Device Storage**: All transactions, budgets, recurring schedules, and settings are saved locally in the device's private application storage folder.
3. **SMS Sandboxing**: The SMS parsing engine operates strictly in-memory. Non-debit SMS messages (personal chats, OTPs, promotional codes) are **never written to disk** and are immediately discarded.
4. **Offline Export**: PDF statements and JSON database backups are synthesized purely on-device and shared via native Android intents.

---

## 📄 License

This project is licensed under the **MIT License**.
