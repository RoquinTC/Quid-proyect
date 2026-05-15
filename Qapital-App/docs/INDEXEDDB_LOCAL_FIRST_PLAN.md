# IndexedDB Local-First Architecture Plan

> **App**: Quid — Next.js Life Management App  
> **Current**: Server-first (API → Prisma → SQLite)  
> **Target**: Local-first (IndexedDB → Optimistic UI → Background Sync → API)  
> **Date**: 2026-03-05

---

## Table of Contents

1. [Library Choice](#1-library-choice)
2. [Database Schema Design](#2-database-schema-design)
3. [Data Flow Architecture](#3-data-flow-architecture)
4. [Sync Engine Design](#4-sync-engine-design)
5. [Offline Mutation Queue](#5-offline-mutation-queue)
6. [React Integration](#6-react-integration)
7. [Migration Strategy](#7-migration-strategy)
8. [Data Exclusions](#8-data-exclusions)
9. [Initial Sync](#9-initial-sync)
10. [File Structure](#10-file-structure)
11. [Key Interfaces & Types](#11-key-interfaces--types)
12. [Sync Flow Diagrams](#12-sync-flow-diagrams)
13. [Implementation Order](#13-implementation-order)
14. [Risk Areas & Mitigation](#14-risk-areas--mitigation)

---

## 1. Library Choice

### Recommendation: **Dexie.js v4**

| Criteria | Dexie.js v4 | Raw IndexedDB | idb | LocalForage | PouchDB |
|---|---|---|---|---|---|
| Type safety | Excellent (generic tables) | None | Good | Poor | Poor |
| Reactive queries | `useLiveQuery` built-in | Manual | Manual | None | `usePouch` |
| Schema migrations | Built-in versioned API | Manual | Manual | None | Built-in |
| Transaction support | Simple API, Promise-based | Complex | OK | None | Built-in |
| Bundle size | ~13KB gzipped | 0 | ~4KB | ~8KB | ~45KB |
| Relations/joins | Supported via `where` + manual | Manual | Manual | None | MapReduce |
| Production maturity | Battle-tested | N/A | Good | Good | Good |

**Why NOT the others:**
- **Raw IndexedDB**: Callback hell, no type safety, no reactivity. Would require building 80% of what Dexie provides.
- **idb**: Thin promise wrapper. No reactive queries, no schema migrations. We'd build everything on top.
- **LocalForage**: Key-value only. No queries, no indexes, no reactivity. Completely wrong for relational data.
- **PouchDB**: Requires CouchDB on the backend. Our server is SQLite/Prisma. Adding CouchDB is a non-starter.

**Dexie.js v4 advantages for this project:**
- `useLiveQuery` gives us React reactivity for free — when IndexedDB changes, components re-render
- Versioned schema matches our Prisma migration approach
- TypeScript generics let us share type definitions with the server
- Transaction API is critical for the complex multi-table operations (e.g., debt payment)

### Install

```bash
npm install dexie dexie-react-hooks
```

---

## 2. Database Schema Design

### Principles

1. **Mirror Prisma models** — same field names, same types where possible
2. **Add sync metadata** — every table gets `_syncStatus`, `_version`, `_lastModified`
3. **Denormalize for reads** — embed related data that the UI always needs (e.g., account name in transaction)
4. **Omit sensitive data** — no passwords, no server-only fields
5. **Use CUID IDs** — generate IDs client-side (same as server) for offline creation

### Tables to Store Locally (IndexedDB)

| Table | Prisma Model | Store? | Rationale |
|---|---|---|---|
| `accounts` | Account | **Yes** | Core data, needed offline |
| `subAccounts` | SubAccount | **Yes** | Part of account hierarchy |
| `transactions` | Transaction | **Yes** | Core data, needed offline |
| `budgets` | Budget | **Yes** | Core data, needed offline |
| `debts` | Debt | **Yes** | Core data, needed offline |
| `installments` | Installment | **Yes** | Part of debt management |
| `abonos` | Abono | **Yes** | Payment history |
| `abonoDetails` | AbonoDetail | **Yes** | Payment breakdown |
| `recurringPayments` | RecurringPayment | **Yes** | Needed for offline scheduling |
| `payrollGroups` | PayrollGroup | **Yes** | Needed for recurring payment generation |
| `savingsGoals` | SavingsGoal | **Yes** | Core data |
| `savingsGoalAccounts` | SavingsGoalAccount | **Yes** | Link table |
| `savingsContributions` | SavingsContribution | **Yes** | Contribution history |
| `cdts` | CDT | **Yes** | Investment data |
| `yieldRecords` | YieldRecord | **Yes** | Yield tracking |
| `vehicles` | Vehicle | **Yes** | Transport module |
| `fuelLogs` | FuelLog | **Yes** | Transport module |
| `maintenanceRecords` | MaintenanceRecord | **Yes** | Transport module |
| `fuelPrices` | FuelPrice | **Yes** | Transport module |
| `medications` | Medication | **Yes** | Health module |
| `appointments` | MedicalAppointment | **Yes** | Health module |
| `pantryItems` | PantryItem | **Yes** | Pantry module |
| `shoppingLists` | ShoppingList | **Yes** | Pantry module |
| `shoppingListItems` | ShoppingListItem | **Yes** | Pantry module |
| `healthProfiles` | HealthProfile | **Yes** | Pantry module |
| `userSettings` | UserSettings | **Yes** | Settings needed offline |
| `categories` | (virtual) | **Yes** | Derived from transactions/budgets, cache locally |
| `sharedAccountUsers` | SharedAccountUser | **Read-only** | Synced from server, never mutated locally |
| **mutationQueue** | (new) | **Yes** | Offline mutation queue |
| **syncMeta** | (new) | **Yes** | Sync state tracking |

### Tables NOT Stored Locally

| Table | Why Not |
|---|---|
| `User` (auth fields) | Passwords, session data — server-only |
| `User.onboardingStep` | Managed server-side during onboarding |

### Dexie Schema Definition

```typescript
// src/lib/local/db.ts

import Dexie, { type Table } from 'dexie';

// ─── Sync Metadata added to every local record ───

export type SyncStatus = 'synced' | 'pending_create' | 'pending_update' | 'pending_delete' | 'conflict';

export interface SyncMeta {
  _syncStatus: SyncStatus;
  _version: number;        // Monotonic version for conflict detection
  _lastModified: number;   // Unix timestamp ms — for incremental pull
  _serverId?: string;      // Server-assigned ID (same as `id` for synced records)
}

// ─── Local Record Types (Prisma model + SyncMeta) ───

export interface LocalAccount extends SyncMeta {
  id: string;
  userId: string;
  name: string;
  type: string;
  color: string;
  icon?: string | null;
  balance: number;
  isHighYield: boolean;
  yieldPercentage?: number | null;
  isShared: boolean;
  excludeFromAvailable: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSubAccount extends SyncMeta {
  id: string;
  accountId: string;
  name: string;
  type: string;
  balance: number;
  isHighYield: boolean;
  yieldPercentage?: number | null;
  icon?: string | null;
  color?: string | null;
  excludeFromAvailable: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalTransaction extends SyncMeta {
  id: string;
  userId: string;
  accountId?: string | null;
  subAccountId?: string | null;
  type: string;
  amount: number;
  description: string;
  category?: string | null;
  subCategory?: string | null;
  date: string;
  sourceModule?: string | null;
  sourceId?: string | null;
  isRecurring: boolean;
  notes?: string | null;
  relatedTransactionId?: string | null;
  createdAt: string;
  updatedAt: string;
  // Denormalized for display
  accountName?: string | null;
  accountColor?: string | null;
  accountType?: string | null;
  subAccountName?: string | null;
}

export interface LocalBudget extends SyncMeta {
  id: string;
  userId: string;
  type: string;
  category: string;
  subCategory?: string | null;
  amount: number;
  spent: number;
  period: string;
  lastResetDate?: string | null;
  icon?: string | null;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalDebt extends SyncMeta {
  id: string;
  userId: string;
  type: string;
  name: string;
  color: string;
  icon?: string | null;
  bank?: string | null;
  totalAmount: number;
  currentBalance: number;
  interestRate?: number | null;
  cutoffDate?: number | null;
  paymentDate?: number | null;
  monthlyPayment?: number | null;
  remainingPayments?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalInstallment extends SyncMeta {
  id: string;
  debtId: string;
  description: string;
  totalAmount: number;
  totalInstallments: number;
  currentInstallment: number;
  installmentAmount: number;
  paidAmount: number;
  interestRate?: number | null;
  interestAmount?: number | null;
  remainingBalance?: number | null;
  purchaseDate: string;
  nextPaymentDate: string;
  isPaid: boolean;
  accountId?: string | null;
  subAccountId?: string | null;
  category?: string | null;
  subCategory?: string | null;
  recurringPaymentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ... similar interfaces for all other models ...

export interface LocalRecurringPayment extends SyncMeta {
  id: string;
  userId: string;
  description: string;
  amount: number;
  actualAmount?: number | null;
  type: string;
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
  destinationAccountId?: string | null;
  destinationSubAccountId?: string | null;
  category?: string | null;
  subCategory?: string | null;
  scheduledDate: string;
  confirmedDate?: string | null;
  status: string;
  frequency: string;
  notes?: string | null;
  isRecurring: boolean;
  savingsGoalId?: string | null;
  customDays?: string | null;
  periodAmounts?: string | null;
  payrollGroupId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalPayrollGroup extends SyncMeta {
  id: string;
  userId: string;
  description: string;
  frequency: string;
  totalAmount: number;
  accountId: string;
  subAccountId?: string | null;
  category: string;
  subCategory?: string | null;
  adjustToBusinessDay: boolean;
  businessDayDirection: string;
  schedules: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSavingsGoal extends SyncMeta {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  targetAmount: number;
  currentAmount: number;
  deadline?: string | null;
  icon?: string | null;
  color: string;
  type: string;
  aiSuggestion?: string | null;
  isActive: boolean;
  frequency: string;
  monthlyDay?: number | null;
  biweeklyDays?: string | null;
  weeklyDay?: number | null;
  periodAmounts?: string | null;
  sourceAccountId?: string | null;
  destinationAccountId?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSavingsGoalAccount extends SyncMeta {
  id: string;
  goalId: string;
  accountId: string;
  subAccountId?: string | null;
  createdAt: string;
}

export interface LocalSavingsContribution extends SyncMeta {
  id: string;
  goalId: string;
  amount: number;
  date: string;
  description?: string | null;
  transactionId?: string | null;
  accountId?: string | null;
  createdAt: string;
}

export interface LocalCDT extends SyncMeta {
  id: string;
  userId: string;
  bank: string;
  amount: number;
  effectiveRate: number;
  startDate: string;
  endDate: string;
  termDays: number;
  interestEarned: number;
  status: string;
  goalId?: string | null;
  accountId?: string | null;
  withdrawnAmount?: number | null;
  withdrawnDate?: string | null;
  notes?: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalYieldRecord extends SyncMeta {
  id: string;
  accountId?: string | null;
  subAccountId?: string | null;
  month: string;
  projectedYield: number;
  actualYield?: number | null;
  yieldPercentage: number;
  isConfirmed: boolean;
  transactionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalAbono extends SyncMeta {
  id: string;
  userId: string;
  debtId: string;
  transactionId?: string | null;
  totalAmount: number;
  accountId: string;
  subAccountId?: string | null;
  date: string;
  isReversed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalAbonoDetail extends SyncMeta {
  id: string;
  abonoId: string;
  installmentId: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
}

// Transport module
export interface LocalVehicle extends SyncMeta {
  id: string; userId: string; name: string; type: string;
  brand?: string | null; model?: string | null; year?: number | null;
  color?: string | null; tankCapacity?: number | null; fuelType?: string | null;
  currentKm: number; icon?: string | null;
  createdAt: string; updatedAt: string;
}

export interface LocalFuelLog extends SyncMeta {
  id: string; vehicleId: string; date: string; km: number;
  amount: number; pricePerGallon: number; gallons: number;
  isFullTank: boolean; notes?: string | null; createdAt: string;
}

export interface LocalMaintenanceRecord extends SyncMeta {
  id: string; vehicleId: string; type: string; description: string;
  cost: number; km: number; date: string; nextDueKm?: number | null;
  nextDueDate?: string | null; reminderEnabled: boolean;
  createdAt: string; updatedAt: string;
}

export interface LocalFuelPrice extends SyncMeta {
  id: string; userId: string; fuelType: string; pricePerGallon: number;
  createdAt: string; updatedAt: string;
}

// Health module
export interface LocalMedication extends SyncMeta {
  id: string; userId: string; name: string; dosage: string;
  frequency: string; customSchedule?: string | null; disease?: string | null;
  howToTake?: string | null; startDate?: string | null; endDate?: string | null;
  isActive: boolean; reminderEnabled: boolean; reminderTimes?: string | null;
  createdAt: string; updatedAt: string;
}

export interface LocalAppointment extends SyncMeta {
  id: string; userId: string; doctorName?: string | null;
  specialty?: string | null; location?: string | null; date: string;
  notes?: string | null; reminderEnabled: boolean; status: string;
  createdAt: string; updatedAt: string;
}

// Pantry module
export interface LocalPantryItem extends SyncMeta {
  id: string; userId: string; name: string; category?: string | null;
  quantity: number; unit: string; expirationDate?: string | null;
  purchaseDate?: string | null; purchasePrice?: number | null;
  minStock?: number | null; createdAt: string; updatedAt: string;
}

export interface LocalShoppingList extends SyncMeta {
  id: string; userId: string; name: string; status: string;
  profileId?: string | null; createdAt: string; updatedAt: string;
}

export interface LocalShoppingListItem extends SyncMeta {
  id: string; shoppingListId: string; name: string; quantity: number;
  unit: string; estimatedPrice?: number | null; actualPrice?: number | null;
  isPurchased: boolean; checked: boolean; pantryItemId?: string | null;
  createdAt: string; updatedAt: string;
}

export interface LocalHealthProfile extends SyncMeta {
  id: string; userId: string; name: string; type: string;
  diseases?: string | null; restrictions?: string | null;
  aiRestrictions?: string | null; createdAt: string; updatedAt: string;
}

export interface LocalUserSettings extends SyncMeta {
  id: string; userId: string; theme: string; budgetCutoffDay: number;
  respectHolidays: boolean; countryCode: string;
  lastBudgetReset?: string | null; notificationsEnabled: boolean;
  createdAt: string; updatedAt: string;
}

export interface LocalSharedAccountUser extends SyncMeta {
  id: string; accountId: string; userId: string;
  role: string; createdAt: string;
}

// ─── Mutation Queue Entry ───

export type MutationOperation = 'create' | 'update' | 'delete' | 'complex';

export interface MutationQueueEntry {
  id: string;                   // CUID, generated client-side
  operation: MutationOperation;
  tableName: string;            // Which table this mutation affects
  recordId: string;             // ID of the affected record
  /** For simple CRUD: the data to send to the server */
  payload: string;              // JSON-serialized request body
  /** For complex operations: the API route and method to call */
  apiRoute?: string;            // e.g., '/api/debts/[id]/pay'
  apiMethod?: string;           // e.g., 'POST'
  /** Optimistic state snapshot — for rollback on failure */
  snapshot?: string;            // JSON-serialized previous state
  /** Ordering — mutations must be replayed in order */
  sequence: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  retryCount: number;
  error?: string;
  createdAt: number;            // Unix timestamp
  updatedAt: number;
  /** Group ID — complex operations produce multiple mutations that must be applied together */
  groupId?: string;
}

// ─── Sync Metadata Table ───

export interface SyncMetaRecord {
  key: string;                  // e.g., 'lastPullTimestamp', 'lastPushTimestamp'
  value: string;                // JSON string
  updatedAt: number;
}

// ─── Dexie Database Class ───

class QuidDB extends Dexie {
  accounts!: Table<LocalAccount>;
  subAccounts!: Table<LocalSubAccount>;
  transactions!: Table<LocalTransaction>;
  budgets!: Table<LocalBudget>;
  debts!: Table<LocalDebt>;
  installments!: Table<LocalInstallment>;
  abonos!: Table<LocalAbono>;
  abonoDetails!: Table<LocalAbonoDetail>;
  recurringPayments!: Table<LocalRecurringPayment>;
  payrollGroups!: Table<LocalPayrollGroup>;
  savingsGoals!: Table<LocalSavingsGoal>;
  savingsGoalAccounts!: Table<LocalSavingsGoalAccount>;
  savingsContributions!: Table<LocalSavingsContribution>;
  cdts!: Table<LocalCDT>;
  yieldRecords!: Table<LocalYieldRecord>;
  vehicles!: Table<LocalVehicle>;
  fuelLogs!: Table<LocalFuelLog>;
  maintenanceRecords!: Table<LocalMaintenanceRecord>;
  fuelPrices!: Table<LocalFuelPrice>;
  medications!: Table<LocalMedication>;
  appointments!: Table<LocalAppointment>;
  pantryItems!: Table<LocalPantryItem>;
  shoppingLists!: Table<LocalShoppingList>;
  shoppingListItems!: Table<LocalShoppingListItem>;
  healthProfiles!: Table<LocalHealthProfile>;
  userSettings!: Table<LocalUserSettings>;
  sharedAccountUsers!: Table<LocalSharedAccountUser>;
  mutationQueue!: Table<MutationQueueEntry>;
  syncMeta!: Table<SyncMetaRecord>;

  constructor() {
    super('quid-db');

    this.version(1).stores({
      // Primary key is `id`. Index frequently queried fields.
      accounts: 'id, userId, type, order, _syncStatus, _lastModified',
      subAccounts: 'id, accountId, order, _syncStatus, _lastModified',
      transactions: 'id, userId, accountId, subAccountId, type, category, date, sourceModule, _syncStatus, _lastModified',
      budgets: 'id, userId, type, category, subCategory, _syncStatus, _lastModified',
      debts: 'id, userId, type, _syncStatus, _lastModified',
      installments: 'id, debtId, isPaid, nextPaymentDate, _syncStatus, _lastModified',
      abonos: 'id, userId, debtId, date, _syncStatus, _lastModified',
      abonoDetails: 'id, abonoId, installmentId, _syncStatus',
      recurringPayments: 'id, userId, status, scheduledDate, debtId, savingsGoalId, payrollGroupId, _syncStatus, _lastModified',
      payrollGroups: 'id, userId, accountId, _syncStatus, _lastModified',
      savingsGoals: 'id, userId, isActive, status, _syncStatus, _lastModified',
      savingsGoalAccounts: 'id, goalId, accountId, _syncStatus',
      savingsContributions: 'id, goalId, date, _syncStatus, _lastModified',
      cdts: 'id, userId, status, goalId, _syncStatus, _lastModified',
      yieldRecords: 'id, accountId, subAccountId, month, _syncStatus, _lastModified',
      vehicles: 'id, userId, _syncStatus, _lastModified',
      fuelLogs: 'id, vehicleId, date, _syncStatus, _lastModified',
      maintenanceRecords: 'id, vehicleId, type, date, _syncStatus, _lastModified',
      fuelPrices: 'id, userId, fuelType, _syncStatus, _lastModified',
      medications: 'id, userId, isActive, _syncStatus, _lastModified',
      appointments: 'id, userId, date, status, _syncStatus, _lastModified',
      pantryItems: 'id, userId, category, _syncStatus, _lastModified',
      shoppingLists: 'id, userId, status, _syncStatus, _lastModified',
      shoppingListItems: 'id, shoppingListId, _syncStatus, _lastModified',
      healthProfiles: 'id, userId, type, _syncStatus, _lastModified',
      userSettings: 'id, userId, _syncStatus, _lastModified',
      sharedAccountUsers: 'id, accountId, userId, _syncStatus',
      mutationQueue: 'id, tableName, status, sequence, groupId, createdAt',
      syncMeta: 'key',
    });
  }
}

export const localDB = new QuidDB();
```

---

## 3. Data Flow Architecture

### Read Path

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  React       │     │  Dexie           │     │  API Server   │
│  Component   │     │  useLiveQuery()  │     │  (SQLite)     │
└──────┬───────┘     └────────┬─────────┘     └──────┬────────┘
       │                      │                       │
       │  1. Subscribe to     │                       │
       │     local data       │                       │
       ├─────────────────────►│                       │
       │                      │                       │
       │  2. Return cached    │                       │
       │     data instantly   │                       │
       │◄─────────────────────┤                       │
       │                      │                       │
       │  3. Render           │                       │
       │     immediately      │                       │
       │                      │                       │
       │                      │   4. Background:      │
       │                      │      Pull latest      │
       │                      │      from server      │
       │                      ├──────────────────────►│
       │                      │                       │
       │                      │   5. Server responds  │
       │                      │      with changes     │
       │                      │◄──────────────────────┤
       │                      │                       │
       │  6. useLiveQuery     │                       │
       │     re-fires with    │                       │
       │     updated data     │                       │
       │◄─────────────────────┤                       │
       │                      │                       │
       │  7. Re-render with   │                       │
       │     fresh data       │                       │
```

### Write Path

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐     ┌──────────────┐
│  React       │     │  Dexie           │     │  Mutation     │     │  API Server   │
│  Component   │     │  IndexedDB       │     │  Queue        │     │  (SQLite)     │
└──────┬───────┘     └────────┬─────────┘     └──────┬────────┘     └──────┬────────┘
       │                      │                       │                     │
       │  1. User action      │                       │                     │
       │     (e.g., create    │                       │                     │
       │      transaction)    │                       │                     │
       ├─────────────────────►│                       │                     │
       │                      │                       │                     │
       │                      │  2. Write to IDB      │                     │
       │                      │     (optimistic)      │                     │
       │                      │     _syncStatus =      │                     │
       │                      │     'pending_create'  │                     │
       │                      │                       │                     │
       │  3. useLiveQuery     │                       │                     │
       │     fires — UI       │                       │                     │
       │     updates          │                       │                     │
       │◄─────────────────────┤                       │                     │
       │                      │                       │                     │
       │                      │  4. Enqueue mutation   │                     │
       │                      ├──────────────────────►│                     │
       │                      │                       │                     │
       │  5. Show success     │                       │  6. If online,      │
       │     toast            │                       │     push to server  │
       │                      │                       ├────────────────────►│
       │                      │                       │                     │
       │                      │                       │  7. Server responds │
       │                      │                       │◄────────────────────┤
       │                      │                       │                     │
       │                      │  8. Update IDB with   │                     │
       │                      │     server response   │                     │
       │                      │     _syncStatus =      │                     │
       │                      │     'synced'           │                     │
       │◄─────────────────────┤                       │                     │
       │                      │                       │                     │
       │  9. Mark mutation    │                       │                     │
       │     as completed     │                       │                     │
```

### First Load Path

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│  React       │     │  Dexie           │     │  API Server   │
│  Component   │     │  IndexedDB       │     │  (SQLite)     │
└──────┬───────┘     └────────┬─────────┘     └──────┬────────┘
       │                      │                       │
       │  1. Check if IDB     │                       │
       │     has data         │                       │
       ├─────────────────────►│                       │
       │                      │                       │
       │  2. IDB is empty     │                       │
       │◄─────────────────────┤                       │
       │                      │                       │
       │  3. Show loading     │                       │
       │     skeleton         │                       │
       │                      │                       │
       │  4. Fetch all data   │                       │
       │     from server      │                       │
       ├─────────────────────────────────────────────►│
       │                      │                       │
       │  5. Server returns   │                       │
       │     full dataset     │                       │
       │◄─────────────────────────────────────────────┤
       │                      │                       │
       │  6. Bulk insert      │                       │
       │     into IDB         │                       │
       ├─────────────────────►│                       │
       │                      │                       │
       │  7. useLiveQuery     │                       │
       │     fires — render   │                       │
       │◄─────────────────────┤                       │
       │                      │                       │
       │  8. Record sync      │                       │
       │     timestamp        │                       │
```

---

## 4. Sync Engine Design

### Change Tracking

Every record in IndexedDB has `_syncStatus` and `_lastModified` fields:

- **`_syncStatus`**: `'synced'` | `'pending_create'` | `'pending_update'` | `'pending_delete'` | `'conflict'`
- **`_lastModified`**: Unix timestamp (ms) — updated on every local write and every server pull
- **`_version`**: Monotonically increasing integer — incremented on every change (used for conflict detection)

### Push: Local → Server

```typescript
// src/lib/local/sync/push.ts

async function pushPendingChanges(): Promise<void> {
  // 1. Get all pending mutations, ordered by sequence
  const pending = await localDB.mutationQueue
    .where('status')
    .equals('pending')
    .sortBy('sequence');

  if (pending.length === 0) return;

  // 2. Process mutations one by one (in order)
  for (const mutation of pending) {
    try {
      // Mark as in-progress
      await localDB.mutationQueue.update(mutation.id, {
        status: 'in_progress',
        updatedAt: Date.now(),
      });

      if (mutation.operation === 'complex') {
        // Complex operations: replay the full API call
        await replayComplexOperation(mutation);
      } else {
        // Simple CRUD: apply to server
        await replaySimpleCRUD(mutation);
      }

      // Mark as completed
      await localDB.mutationQueue.update(mutation.id, {
        status: 'completed',
        updatedAt: Date.now(),
      });

    } catch (error) {
      // Mark as failed — will retry later
      await localDB.mutationQueue.update(mutation.id, {
        status: 'failed',
        retryCount: mutation.retryCount + 1,
        error: String(error),
        updatedAt: Date.now(),
      });

      // If this mutation is part of a group, stop processing the group
      if (mutation.groupId) {
        break;
      }
    }
  }

  // 3. Clean up completed mutations (keep last 100 for debugging)
  const completed = await localDB.mutationQueue
    .where('status')
    .equals('completed')
    .reverse()
    .sortBy('createdAt');

  if (completed.length > 100) {
    const toDelete = completed.slice(100).map(m => m.id);
    await localDB.mutationQueue.bulkDelete(toDelete);
  }
}

async function replaySimpleCRUD(mutation: MutationQueueEntry): Promise<void> {
  const payload = JSON.parse(mutation.payload);
  let response: Response;

  switch (mutation.operation) {
    case 'create': {
      response = await fetch(`/api/${tableNameToRoute(mutation.tableName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      break;
    }
    case 'update': {
      response = await fetch(`/api/${tableNameToRoute(mutation.tableName)}/${mutation.recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      break;
    }
    case 'delete': {
      response = await fetch(`/api/${tableNameToRoute(mutation.tableName)}/${mutation.recordId}`, {
        method: 'DELETE',
      });
      break;
    }
  }

  if (!response.ok) {
    throw new Error(`Server returned ${response.status}`);
  }

  // Update local record with server response (server may assign IDs, compute fields)
  const serverData = await response.json();
  await localDB.table(mutation.tableName).update(mutation.recordId, {
    ...serverData,
    _syncStatus: 'synced',
    _version: (await localDB.table(mutation.tableName).get(mutation.recordId))?._version! + 1,
    _lastModified: Date.now(),
  });
}
```

### Pull: Server → Local

```typescript
// src/lib/local/sync/pull.ts

async function pullServerChanges(): Promise<void> {
  const lastPull = await getSyncMeta('lastPullTimestamp');
  const lastPullMs = lastPull ? parseInt(lastPull) : 0;

  // 1. Fetch all records modified since last pull
  const response = await fetch(`/api/sync/pull?since=${lastPullMs}`);
  if (!response.ok) throw new Error('Pull failed');

  const changes: SyncPullResponse = await response.json();

  // 2. Apply changes to IndexedDB
  await localDB.transaction('rw', localDB.tables, async () => {
    for (const [tableName, records] of Object.entries(changes.records)) {
      const table = localDB.table(tableName);
      if (!table) continue;

      for (const record of records) {
        const existing = await table.get(record.id);

        if (!existing) {
          // New record from server
          await table.put({
            ...record,
            _syncStatus: 'synced',
            _version: 1,
            _lastModified: Date.now(),
          });
        } else if (existing._syncStatus === 'synced') {
          // No local changes — accept server version
          await table.put({
            ...record,
            _syncStatus: 'synced',
            _version: existing._version + 1,
            _lastModified: Date.now(),
          });
        } else if (existing._syncStatus.startsWith('pending_')) {
          // Conflict! Local changes not yet pushed
          await resolveConflict(tableName, existing, record);
        }
      }
    }
  });

  // 3. Handle deletions
  for (const { tableName, id } of changes.deletions) {
    const table = localDB.table(tableName);
    if (table) {
      const existing = await table.get(id);
      if (existing?._syncStatus === 'synced') {
        await table.delete(id);
      }
    }
  }

  // 4. Update last pull timestamp
  await setSyncMeta('lastPullTimestamp', String(Date.now()));
}
```

### Conflict Resolution Strategy

For a **financial app**, we use **Server Wins** for all data except:

- **UI preferences** (widget order, sidebar state) → Local wins (these aren't synced)
- **New records** created offline → Merge (server assigns final ID)

```
Conflict Detection:
  Local record has _syncStatus = 'pending_*' AND server sends an update

Resolution:
  1. FINANCIAL DATA (balances, amounts, transactions):
     → Server wins. Always.
     → Reason: Server is the source of truth for financial calculations.
     → Action: Replace local with server data, mark as 'synced'
     → User notification: "Los datos se sincronizaron con el servidor"

  2. METADATA (name, color, icon, order):
     → Last-write-wins based on updatedAt timestamp
     → If server.updatedAt > local.updatedAt: server wins
     → If local.updatedAt > server.updatedAt: keep local, push later

  3. NEW RECORDS (created offline):
     → Always keep. Server will assign the final state.
     → The client-generated CUID is used as temporary ID.
     → After server accepts, update local record with server response.
```

---

## 5. Offline Mutation Queue

### Queue Design

The mutation queue is an IndexedDB table with the following properties:

1. **Ordered**: Mutations have a `sequence` number — processed in order
2. **Grouped**: Complex operations (e.g., debt payment) produce multiple mutations with the same `groupId` — all-or-nothing
3. **Persistent**: Survives page refreshes, app restarts
4. **Retryable**: Failed mutations retry with exponential backoff

### How to Store Pending Mutations

```typescript
// src/lib/local/mutation-queue.ts

let sequenceCounter = 0;

export async function enqueueMutation(
  operation: MutationOperation,
  tableName: string,
  recordId: string,
  payload: Record<string, unknown>,
  options?: {
    snapshot?: Record<string, unknown>;
    apiRoute?: string;
    apiMethod?: string;
    groupId?: string;
  }
): Promise<void> {
  const entry: MutationQueueEntry = {
    id: generateCUID(),
    operation,
    tableName,
    recordId,
    payload: JSON.stringify(payload),
    apiRoute: options?.apiRoute,
    apiMethod: options?.apiMethod,
    snapshot: options?.snapshot ? JSON.stringify(options.snapshot) : undefined,
    sequence: ++sequenceCounter,
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    groupId: options?.groupId,
  };

  await localDB.mutationQueue.add(entry);

  // Trigger background sync if online
  if (navigator.onLine) {
    triggerPush();
  }
}
```

### Replaying Mutations When Online

```typescript
// src/lib/local/sync/sync-coordinator.ts

let isPushing = false;
let isPulling = false;

export function startSyncEngine(): void {
  // Listen for online events
  window.addEventListener('online', () => {
    console.log('[Sync] Back online — starting sync');
    syncNow();
  });

  // Periodic sync while online (every 30 seconds)
  setInterval(() => {
    if (navigator.onLine) {
      syncNow();
    }
  }, 30_000);

  // Initial sync on app load
  if (navigator.onLine) {
    syncNow();
  }
}

export async function syncNow(): Promise<void> {
  // Always pull first, then push
  if (!isPulling) {
    isPulling = true;
    try {
      await pullServerChanges();
    } catch (error) {
      console.error('[Sync] Pull failed:', error);
    } finally {
      isPulling = false;
    }
  }

  if (!isPushing) {
    isPushing = true;
    try {
      await pushPendingChanges();
    } catch (error) {
      console.error('[Sync] Push failed:', error);
    } finally {
      isPushing = false;
    }
  }
}
```

### Handling Failures

```typescript
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 1000; // 1s, 2s, 4s, 8s, 16s

async function getRetryDelay(retryCount: number): Promise<number> {
  const delay = BACKOFF_BASE_MS * Math.pow(2, retryCount);
  const jitter = delay * 0.1 * Math.random();
  return delay + jitter;
}

// After all retries exhausted:
async function handlePermanentFailure(mutation: MutationQueueEntry): Promise<void> {
  // 1. Revert optimistic change if we have a snapshot
  if (mutation.snapshot) {
    const previousState = JSON.parse(mutation.snapshot);
    await localDB.table(mutation.tableName).put({
      ...previousState,
      _syncStatus: 'conflict',
      _lastModified: Date.now(),
    });
  }

  // 2. Notify user
  toast.error('Error de sincronización', {
    description: `No se pudo sincronizar un cambio. Ve a Configuración para reintentar.`,
    duration: 10000,
    action: {
      label: 'Reintentar',
      onClick: () => retryFailedMutations(),
    },
  });
}
```

### Complex Operations

The debt payment is the most complex operation. It touches 6+ tables. Strategy:

```typescript
// For complex operations like debt payment, we DON'T try to replay
// the individual table changes. Instead, we:
//
// 1. Execute the complex operation optimistically on IndexedDB
//    (all the balance updates, installment changes, etc.)
// 2. Queue a SINGLE mutation with the full API request
// 3. When replaying, call the API route directly
// 4. On success, replace local state with server response
// 5. On failure, rollback using the snapshot

export async function payDebtLocally(
  debtId: string,
  options: { interestRates?: Record<string, number>; selectedInstallmentIds?: string[] }
): Promise<void> {
  const groupId = generateCUID();

  // 1. Snapshot current state for rollback
  const debt = await localDB.debts.get(debtId);
  const installments = await localDB.installments.where('debtId').equals(debtId).toArray();
  const snapshot = { debt, installments };

  // 2. Execute optimistically within a transaction
  await localDB.transaction('rw',
    [localDB.debts, localDB.installments, localDB.transactions,
     localDB.accounts, localDB.subAccounts, localDB.budgets],
    async () => {
      // ... replicate the server logic optimistically ...
      // Mark all affected records with _syncStatus = 'pending_update'
    }
  );

  // 3. Queue a single complex mutation
  await enqueueMutation('complex', 'debts', debtId, {
    interestRates: options.interestRates,
    selectedInstallmentIds: options.selectedInstallmentIds,
  }, {
    apiRoute: `/api/debts/${debtId}/pay`,
    apiMethod: 'POST',
    snapshot,
    groupId,
  });
}

async function replayComplexOperation(mutation: MutationQueueEntry): Promise<void> {
  const payload = JSON.parse(mutation.payload);

  const response = await fetch(mutation.apiRoute!, {
    method: mutation.apiMethod!,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Server returned ${response.status}`);
  }

  const result = await response.json();

  // After server accepts, pull the latest state to ensure consistency
  await pullServerChanges();
}
```

---

## 6. React Integration

### Custom Hooks for Data Access

```typescript
// src/lib/local/hooks/use-accounts.ts

import { useLiveQuery } from 'dexie-react-hooks';
import { localDB } from '../db';

export function useLocalAccounts() {
  const accounts = useLiveQuery(async () => {
    const accs = await localDB.accounts.orderBy('order').toArray();

    // Enrich with sub-accounts
    const enriched = await Promise.all(
      accs.map(async (acc) => {
        const subAccounts = await localDB.subAccounts
          .where('accountId')
          .equals(acc.id)
          .sortBy('order');

        const sharedUsers = await localDB.sharedAccountUsers
          .where('accountId')
          .equals(acc.id)
          .toArray();

        return { ...acc, subAccounts, sharedUsers };
      })
    );

    return enriched;
  });

  return {
    accounts: accounts ?? [],
    loading: accounts === undefined,
  };
}

// src/lib/local/hooks/use-transactions.ts

export function useLocalTransactions(filters?: {
  accountId?: string;
  subAccountId?: string;
  type?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  sourceModule?: string;
  limit?: number;
}) {
  const transactions = useLiveQuery(async () => {
    let results = await localDB.transactions.orderBy('date').reverse().toArray();

    if (filters?.accountId) results = results.filter(t => t.accountId === filters.accountId);
    if (filters?.subAccountId) results = results.filter(t => t.subAccountId === filters.subAccountId);
    if (filters?.type) results = results.filter(t => t.type === filters.type);
    if (filters?.category) results = results.filter(t => t.category === filters.category);
    if (filters?.sourceModule) results = results.filter(t => t.sourceModule === filters.sourceModule);
    if (filters?.startDate) results = results.filter(t => t.date >= filters.startDate!);
    if (filters?.endDate) results = results.filter(t => t.date <= filters.endDate!);
    if (filters?.limit) results = results.slice(0, filters.limit);

    return results;
  }, [
    filters?.accountId, filters?.subAccountId, filters?.type,
    filters?.category, filters?.startDate, filters?.endDate,
    filters?.sourceModule, filters?.limit,
  ]);

  return {
    transactions: transactions ?? [],
    loading: transactions === undefined,
  };
}

// src/lib/local/hooks/use-budgets.ts

export function useLocalBudgets(type?: 'income' | 'expense') {
  const budgets = useLiveQuery(async () => {
    if (type) {
      return localDB.budgets.where('type').equals(type).toArray();
    }
    return localDB.budgets.toArray();
  }, [type]);

  return {
    budgets: budgets ?? [],
    loading: budgets === undefined,
  };
}

// src/lib/local/hooks/use-debts.ts

export function useLocalDebts() {
  const debts = useLiveQuery(async () => {
    const dbts = await localDB.debts.toArray();

    const enriched = await Promise.all(
      dbts.map(async (debt) => {
        const installments = await localDB.installments
          .where('debtId')
          .equals(debt.id)
          .toArray();

        return { ...debt, installments };
      })
    );

    return enriched;
  });

  return {
    debts: debts ?? [],
    loading: debts === undefined,
  };
}
```

### Sync Status Hook

```typescript
// src/lib/local/hooks/use-sync-status.ts

import { useLiveQuery } from 'dexie-react-hooks';
import { localDB } from '../db';
import { useSyncStore } from '../sync-store';

export function useSyncStatus() {
  const pendingCount = useLiveQuery(async () => {
    return localDB.mutationQueue
      .where('status')
      .anyOf(['pending', 'in_progress', 'failed'])
      .count();
  });

  const failedCount = useLiveQuery(async () => {
    return localDB.mutationQueue
      .where('status')
      .equals('failed')
      .count();
  });

  const { isSyncing, lastSyncAt } = useSyncStore();

  return {
    isSyncing,
    pendingCount: pendingCount ?? 0,
    failedCount: failedCount ?? 0,
    lastSyncAt,
    hasPendingChanges: (pendingCount ?? 0) > 0,
    hasFailures: (failedCount ?? 0) > 0,
  };
}
```

### Sync Status Store (Zustand)

```typescript
// src/lib/local/sync-store.ts

import { create } from 'zustand';

interface SyncState {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  lastError: string | null;
  isInitialized: boolean;

  setSyncing: (syncing: boolean) => void;
  setLastSync: (date: Date) => void;
  setError: (error: string | null) => void;
  setInitialized: (initialized: boolean) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  lastSyncAt: null,
  lastError: null,
  isInitialized: false,

  setSyncing: (syncing) => set({ isSyncing: syncing }),
  setLastSync: (date) => set({ lastSyncAt: date, lastError: null }),
  setError: (error) => set({ lastError: error }),
  setInitialized: (initialized) => set({ isInitialized: initialized }),
}));
```

### Sync Status UI Component

```typescript
// src/components/pwa/sync-status-indicator.tsx

'use client';

import { useSyncStatus } from '@/lib/local/hooks/use-sync-status';
import { Loader2, AlertCircle, CloudOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function SyncStatusIndicator() {
  const { isSyncing, pendingCount, failedCount, hasPendingChanges, hasFailures } = useSyncStatus();

  if (!hasPendingChanges && !hasFailures && !isSyncing) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="fixed bottom-20 right-4 z-50"
      >
        {isSyncing && (
          <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-full shadow-md text-xs font-medium">
            <Loader2 className="size-3.5 animate-spin" />
            Sincronizando{pendingCount > 1 ? ` (${pendingCount})` : ''}...
          </div>
        )}
        {!isSyncing && hasPendingChanges && (
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-3 py-1.5 rounded-full shadow-md text-xs font-medium">
            <CloudOff className="size-3.5" />
            {pendingCount} cambio{pendingCount > 1 ? 's' : ''} pendiente{pendingCount > 1 ? 's' : ''}
          </div>
        )}
        {hasFailures && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-full shadow-md text-xs font-medium">
            <AlertCircle className="size-3.5" />
            {failedCount} error{failedCount > 1 ? 'es' : ''} de sync
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
```

---

## 7. Migration Strategy

### Phased Approach

We migrate module by module, starting with the simplest and least risky.

#### Phase 0: Infrastructure (Week 1-2)

Set up the IndexedDB layer alongside the existing server-first architecture. No component changes yet.

- [ ] Install Dexie.js and dexie-react-hooks
- [ ] Create `src/lib/local/db.ts` with schema
- [ ] Create `src/lib/local/sync/` directory with sync engine
- [ ] Create `src/lib/local/mutation-queue.ts`
- [ ] Create `src/lib/local/hooks/` with initial hooks
- [ ] Create `/api/sync/pull` API endpoint
- [ ] Add `DeletedRecord` model to Prisma
- [ ] Write the initial sync (full dump) endpoint: `/api/sync/initial`

#### Phase 1: Read-Only Caching (Week 3-4)

Components still write via API, but reads come from IndexedDB first.

- [ ] Wrap each data-fetching component with a dual-read strategy
- [ ] Modules: **Settings**, **Categories**, **Fuel Prices** (simplest, read-heavy)

**How it works for a component:**
```typescript
// BEFORE (current)
const [accounts, setAccounts] = useState([]);
useEffect(() => { apiFetch('/api/accounts').then(setAccounts); }, []);

// AFTER (Phase 1 — read-through cache)
const { accounts, loading } = useLocalAccounts();
// useLiveQuery handles: IDB → render → background API refresh → re-render
```

#### Phase 2: Offline Writes — Simple CRUD (Week 5-7)

Enable offline writes for simple create/update/delete operations.

- [ ] Implement `localWrite()` helper that writes to IDB + enqueues mutation
- [ ] Modules: **Accounts**, **SubAccounts**, **Pantry Items**, **Medications**, **Appointments**
- [ ] These are simple CRUD with no complex side effects
- [ ] Update forms to use `localWrite()` instead of `apiFetch()`

**Component migration pattern:**
```typescript
// BEFORE (current)
const handleSubmit = async () => {
  await apiFetch('/api/accounts', { method: 'POST', body: JSON.stringify(data) });
};

// AFTER (Phase 2 — local-first write)
const handleSubmit = async () => {
  await localWrite('create', 'accounts', {
    id: generateCUID(),
    ...data,
    _syncStatus: 'pending_create',
    _version: 0,
    _lastModified: Date.now(),
  });
};
```

#### Phase 3: Offline Writes — Complex Operations (Week 8-10)

Handle the complex operations that touch multiple tables.

- [ ] **Transactions**: Create + update account balance + update budget
- [ ] **Debt Payment**: Pay installments + update balances + create transactions + update budgets
- [ ] **Recurring Payment Confirmation**: Confirm + create transaction + update budget
- [ ] **Savings Contributions**: Contribute + update goal + create transaction
- [ ] **CDT Finalization**: Finalize + update balance + create transaction

#### Phase 4: Full Local-First (Week 11-12)

All modules fully local-first. API is only for sync.

- [ ] **Budgets** (spent is computed server-side, need to replicate locally)
- [ ] **Vehicles / Fuel Logs / Maintenance**
- [ ] **Shopping Lists** (with AI generation — needs online)
- [ ] **Health Profiles** (with AI restrictions — needs online)
- [ ] Remove the old `apiFetch` pattern from all components
- [ ] Update service worker to intercept API calls for caching

#### Phase 5: Polish & Hardening (Week 13-14)

- [ ] Comprehensive error handling and edge cases
- [ ] Data integrity checks
- [ ] Performance optimization
- [ ] IndexedDB quota management
- [ ] Logout: clear IndexedDB
- [ ] Multi-user/device conflict testing

---

## 8. Data That Should NOT Be Stored Locally

| Data | Why Not Stored | How Handled |
|---|---|---|
| **User password** | Security | Never leaves server |
| **Session tokens** | Security | Managed by next-auth cookies |
| **Other users' data in shared accounts** | Privacy | Only store own userId's data + shared account metadata |
| **AI-generated suggestions** | Requires server computation | Fetch on demand, cache result locally |
| **AI-generated shopping lists** | Requires server computation | Fetch on demand, cache result locally |
| **AI-generated health restrictions** | Requires server computation | Fetch on demand, cache result locally |
| **Dashboard monthly summary** | Computed/aggregated | Compute locally from transactions + budgets OR fetch from server and cache |
| **Onboarding state** | Managed server-side | Fetch when needed, not critical for offline |

### Shared Accounts — Special Handling

- We store the account and its transactions locally (the user can see them)
- We store `sharedAccountUsers` to show who has access
- **We do NOT store other users' full profiles** — only their names/emails as denormalized fields
- When online, we pull updates from the server to get changes made by other users
- When offline, we can only make changes to our own data — shared account changes queue for sync

---

## 9. Initial Sync

### Flow

```
1. User logs in → App mounts
2. Check IndexedDB: does it have ANY data for this user?
   → If YES: Render immediately from IDB, background pull for updates
   → If NO: Show loading screen, fetch everything from server
3. Full initial pull: GET /api/sync/initial
4. Bulk insert into IndexedDB (within a single Dexie transaction)
5. Set syncMeta.lastPullTimestamp = now
6. Render the app
```

### Server Endpoint: `/api/sync/initial`

Fetches ALL data for the authenticated user across all tables in a single request, enabling bulk insertion into IndexedDB.

### Server Endpoint: `/api/sync/pull`

Fetches only records modified since a given timestamp, enabling incremental sync with minimal data transfer.

### Deletion Tracking

Prisma doesn't natively track deletions. We need a **tombstone table**:

```prisma
model DeletedRecord {
  id        String   @id @default(cuid())
  userId    String
  tableName String
  recordId  String
  deletedAt DateTime @default(now())

  @@index([userId, tableName, deletedAt])
  @@map("deleted_records")
}
```

Add to every API DELETE route:
```typescript
await db.deletedRecord.create({
  data: { userId, tableName: 'accounts', recordId: id },
});
```

---

## 10. File Structure

```
src/
├── lib/
│   ├── local/                          # NEW: Local-first layer
│   │   ├── db.ts                       # Dexie database definition + types
│   │   ├── client-id.ts               # CUID generator for offline creation
│   │   │
│   │   ├── write/                      # Local write operations
│   │   │   ├── index.ts               # Re-exports
│   │   │   ├── local-write.ts         # Generic write helper (CRUD)
│   │   │   ├── accounts.ts            # Account-specific writes
│   │   │   ├── transactions.ts        # Transaction writes (with balance updates)
│   │   │   ├── debts.ts               # Debt payment, abono writes
│   │   │   ├── budgets.ts             # Budget writes
│   │   │   ├── savings.ts             # Savings goal + contribution writes
│   │   │   ├── recurring.ts           # Recurring payment writes
│   │   │   ├── cdts.ts                # CDT writes
│   │   │   ├── vehicles.ts            # Vehicle/fuel/maintenance writes
│   │   │   ├── health.ts              # Medication/appointment writes
│   │   │   └── pantry.ts              # Pantry/shopping writes
│   │   │
│   │   ├── hooks/                      # React hooks for data access
│   │   │   ├── index.ts               # Re-exports
│   │   │   ├── use-accounts.ts
│   │   │   ├── use-transactions.ts
│   │   │   ├── use-budgets.ts
│   │   │   ├── use-debts.ts
│   │   │   ├── use-savings.ts
│   │   │   ├── use-recurring.ts
│   │   │   ├── use-cdts.ts
│   │   │   ├── use-vehicles.ts
│   │   │   ├── use-health.ts
│   │   │   ├── use-pantry.ts
│   │   │   ├── use-settings.ts
│   │   │   ├── use-sync-status.ts
│   │   │   └── use-initial-sync.ts
│   │   │
│   │   ├── sync/                       # Sync engine
│   │   │   ├── index.ts               # Re-exports
│   │   │   ├── sync-coordinator.ts    # Main sync orchestrator
│   │   │   ├── push.ts                # Push local changes to server
│   │   │   ├── pull.ts                # Pull server changes to local
│   │   │   ├── conflict.ts            # Conflict resolution
│   │   │   ├── initial-sync.ts        # First-load data population
│   │   │   └── mutation-queue.ts      # Queue management
│   │   │
│   │   ├── computed/                   # Computed data (client-side)
│   │   │   ├── balance-calculator.ts  # Compute account balances
│   │   │   ├── budget-calculator.ts   # Compute budget spent
│   │   │   ├── savings-calculator.ts  # Compute savings progress
│   │   │   └── monthly-summary.ts     # Compute monthly summary
│   │   │
│   │   └── providers/
│   │       ├── local-db-provider.tsx   # Provides Dexie instance + sync engine
│   │       └── sync-provider.tsx       # Handles sync lifecycle
│   │
│   ├── db.ts                           # EXISTING: Prisma client
│   ├── api.ts                          # EXISTING: apiFetch (phased out)
│   ├── store.ts                        # EXISTING: Zustand store
│   └── auth.ts                         # EXISTING: NextAuth config
│
├── app/
│   ├── api/
│   │   ├── sync/                       # NEW: Sync endpoints
│   │   │   ├── initial/route.ts       # Full data dump
│   │   │   └── pull/route.ts          # Incremental changes
│   │   └── ...                         # All existing routes preserved
│   └── ...
│
├── components/
│   ├── pwa/
│   │   ├── sync-status-indicator.tsx   # NEW: Shows pending/failed/syncing
│   │   └── ...
│   └── ...
│
└── types/
    └── next-auth.d.ts                  # EXISTING
```

---

## 11. Key Interfaces & Types

### Sync API Types

```typescript
// src/lib/local/types.ts

export interface SyncPullResponse {
  records: Record<string, any[]>;
  deletions: Array<{ tableName: string; id: string }>;
  serverTimestamp: number;
}

export interface SyncInitialResponse {
  records: Record<string, any[]>;
  serverTimestamp: number;
}

export type TableName =
  | 'accounts' | 'subAccounts' | 'transactions' | 'budgets'
  | 'debts' | 'installments' | 'abonos' | 'abonoDetails'
  | 'recurringPayments' | 'payrollGroups'
  | 'savingsGoals' | 'savingsGoalAccounts' | 'savingsContributions' | 'cdts'
  | 'yieldRecords' | 'sharedAccountUsers'
  | 'vehicles' | 'fuelLogs' | 'maintenanceRecords' | 'fuelPrices'
  | 'medications' | 'appointments'
  | 'pantryItems' | 'shoppingLists' | 'shoppingListItems' | 'healthProfiles'
  | 'userSettings';

export interface LocalWriteOptions {
  skipQueue?: boolean;
  snapshot?: boolean;
  groupId?: string;
  apiRoute?: string;
  apiMethod?: string;
}

export interface LocalWriteResult<T> {
  data: T;
  mutationId: string;
  syncStatus: SyncStatus;
}
```

---

## 12. Sync Flow Diagrams

### Full Sync Lifecycle

```
┌──────────────────────────────────────────────────────────────────────┐
│                        APP LIFECYCLE                                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  App Mount                                                           │
│     │                                                                │
│     ▼                                                                │
│  ┌──────────────────┐                                                │
│  │ Check IndexedDB  │                                                │
│  │ has data?        │                                                │
│  └──────┬───────────┘                                                │
│         │                                                            │
│    ┌────┴────┐                                                       │
│    │ YES     │ NO                                                    │
│    ▼         ▼                                                       │
│  ┌───────┐  ┌──────────────┐                                         │
│  │Render │  │ Show loading │                                         │
│  │from   │  │ skeleton     │                                         │
│  │IDB    │  └──────┬───────┘                                         │
│  └───┬───┘         │                                                 │
│      │             ▼                                                 │
│      │     ┌──────────────────┐                                       │
│      │     │ GET /api/sync/  │                                        │
│      │     │ initial         │                                        │
│      │     └──────┬──────────┘                                        │
│      │            ▼                                                   │
│      │     ┌──────────────────┐                                       │
│      │     │ Bulk insert to   │                                       │
│      │     │ IndexedDB        │                                       │
│      │     └──────┬──────────┘                                        │
│      │            │                                                   │
│      ▼            ▼                                                   │
│  ┌───────────────────────────┐                                        │
│  │  Start Sync Engine        │                                        │
│  │  - Listen for online/offline│                                      │
│  │  - Periodic pull (30s)    │                                        │
│  │  - Push on mutation queue │                                        │
│  └──────────┬────────────────┘                                        │
│             │                                                         │
│             ▼                                                         │
│  ┌───────────────────────────┐                                        │
│  │  User Interaction         │                                        │
│  │  - Read: useLiveQuery     │──── Immediate render from IDB          │
│  │  - Write: localWrite()   │──── IDB + Queue + Push if online       │
│  └──────────┬────────────────┘                                        │
│             │                                                         │
│             ▼                                                         │
│  ┌───────────────────────────┐                                        │
│  │  Background Sync Loop     │                                        │
│  │  - Pull (every 30s)       │                                        │
│  │  - Push (on queue change) │                                        │
│  │  - Conflict resolution    │                                        │
│  │  - Retry failed mutations │                                        │
│  └───────────────────────────┘                                        │
└──────────────────────────────────────────────────────────────────────┘
```

### Offline → Online Transition

```
OFFLINE                                          ONLINE
┌─────────┐   ┌─────────┐   ┌──────────┐        ┌──────────────────────────┐
│ User    │──►│ Write   │──►│ Mutation │        │ Sync Engine detects      │
│ Action  │   │ to IDB  │   │ Queue    │        │ online status            │
└─────────┘   │ (optim- │   │ (pending)│        └────────────┬─────────────┘
              │  istic) │   └─────┬────┘                     │
              └─────────┘         │ waiting...               ▼
                                  │           ┌──────────────────────────┐
                                  │           │ 1. Pull first            │
                                  │           │ 2. Push mutations        │
                                  │           │ 3. Resolve conflicts     │
                                  │           └────────────┬─────────────┘
                                  │                        │
                                  ▼                        ▼
                                  ┌────────────────────────────────────┐
                                  │ For each pending mutation:         │
                                  │ ├─ Simple CRUD → replay API call   │
                                  │ ├─ Complex → replay full operation │
                                  │ ├─ Success → mark completed        │
                                  │ └─ Failure → retry with backoff    │
                                  └────────────────────────────────────┘
                                                │
                                                ▼
                                  ┌────────────────────────────────────┐
                                  │ All mutations synced               │
                                  │ → _syncStatus = 'synced' on all    │
                                  │ → Queue cleaned up                 │
                                  │ → UI: "Sincronizado"               │
                                  └────────────────────────────────────┘
```

### Complex Operation (Debt Payment) Flow

```
User taps "Pay Debt"
     │
     ▼
1. SNAPSHOT: Capture current state of affected records
   - debt.currentBalance
   - installment.isPaid / paidAmount
   - account.balance
   - budget.spent
     │
     ▼
2. OPTIMISTIC UPDATE (Dexie transaction):
   - Mark installments as isPaid=true
   - Create new installments (for multi-installment)
   - Update debt.currentBalance
   - Create expense transaction
   - Update account/subAccount balance
   - Update budget.spent
   - Set _syncStatus='pending_update' on all affected
     │
     ▼
3. QUEUE: Add single complex mutation
   { operation: 'complex',
     apiRoute: '/api/debts/[id]/pay',
     apiMethod: 'POST',
     payload: { interestRates, selectedInstallmentIds },
     snapshot: { previous state of all affected records },
     groupId: 'pay-debt-[cuid]' }
     │
     ▼
4. UI: Show success toast + updated balances
     │
     ▼
5. SYNC (when online):
   - Call POST /api/debts/[id]/pay with payload
   - Server executes the full operation
   - Pull latest state from server
   - Replace local optimistic state with server state
   - Mark all records as _syncStatus='synced'
     │
     ▼ (if server rejects)
6. ROLLBACK:
   - Restore snapshot state in IndexedDB
   - Mark records as _syncStatus='conflict'
   - Show error to user
```

---

## 13. Implementation Order

### Sprint 1: Foundation (Days 1-5)

| # | Task | Effort | Risk |
|---|---|---|---|
| 1 | Install Dexie.js + dexie-react-hooks | 0.5h | Low |
| 2 | Create `src/lib/local/db.ts` with full schema | 4h | Low |
| 3 | Create `src/lib/local/sync/mutation-queue.ts` | 3h | Medium |
| 4 | Create `src/lib/local/sync/sync-coordinator.ts` | 4h | Medium |
| 5 | Create `src/lib/local/sync/pull.ts` + `/api/sync/pull` | 6h | Medium |
| 6 | Create `src/lib/local/sync/initial-sync.ts` + `/api/sync/initial` | 4h | Low |
| 7 | Create `src/lib/local/sync-store.ts` | 1h | Low |
| 8 | Create `src/lib/local/providers/local-db-provider.tsx` | 2h | Low |
| 9 | Add `DeletedRecord` model to Prisma | 1h | Low |
| 10 | Create `src/lib/local/hooks/use-sync-status.ts` | 1h | Low |
| 11 | Create `SyncStatusIndicator` component | 2h | Low |

### Sprint 2: Read-Through Cache (Days 6-10)

| # | Task | Effort | Risk |
|---|---|---|---|
| 12 | Create `useLocalAccounts` hook | 3h | Low |
| 13 | Create `useLocalTransactions` hook | 3h | Low |
| 14 | Create `useLocalBudgets` hook | 2h | Low |
| 15 | Create `useLocalDebts` hook (with installments) | 3h | Low |
| 16 | Create hooks for remaining modules | 6h | Low |
| 17 | Migrate `accounts-view.tsx` to use `useLocalAccounts` | 2h | Low |
| 18 | Migrate `finance-overview.tsx` to use local hooks | 4h | Medium |
| 19 | Test read-through: verify data loads from IDB then refreshes | 2h | Low |

### Sprint 3: Simple Offline Writes (Days 11-17)

| # | Task | Effort | Risk |
|---|---|---|---|
| 20 | Create `localWrite()` generic helper | 4h | Medium |
| 21 | Create `src/lib/local/write/accounts.ts` | 2h | Low |
| 22 | Create `src/lib/local/write/pantry.ts` | 2h | Low |
| 23 | Create `src/lib/local/write/health.ts` | 2h | Low |
| 24 | Create `src/lib/local/write/vehicles.ts` | 3h | Low |
| 25 | Migrate account CRUD forms to use localWrite | 3h | Medium |
| 26 | Migrate pantry forms to use localWrite | 2h | Low |
| 27 | Migrate health forms to use localWrite | 2h | Low |
| 28 | Test offline creation/editing/deletion | 4h | Medium |

### Sprint 4: Complex Operations (Days 18-25)

| # | Task | Effort | Risk |
|---|---|---|---|
| 29 | Create `src/lib/local/write/transactions.ts` (with balance + budget) | 6h | High |
| 30 | Create `src/lib/local/write/debts.ts` (pay, abono, reverse) | 8h | **Very High** |
| 31 | Create `src/lib/local/write/recurring.ts` (confirm, reverse) | 4h | High |
| 32 | Create `src/lib/local/write/savings.ts` (contribute, link) | 4h | Medium |
| 33 | Create `src/lib/local/write/cdts.ts` (finalize, withdraw) | 3h | Medium |
| 34 | Create `src/lib/local/computed/balance-calculator.ts` | 3h | Medium |
| 35 | Create `src/lib/local/computed/budget-calculator.ts` | 3h | Medium |
| 36 | Migrate transaction forms | 4h | High |
| 37 | Migrate debt payment flows | 6h | **Very High** |
| 38 | Test complex operations offline | 8h | **Very High** |

### Sprint 5: Full Migration & Polish (Days 26-30)

| # | Task | Effort | Risk |
|---|---|---|---|
| 39 | Migrate remaining budget views | 3h | Medium |
| 40 | Migrate savings views | 2h | Medium |
| 41 | Migrate CDT views | 2h | Medium |
| 42 | Migrate recurring payment views | 3h | Medium |
| 43 | Update service worker for local-first | 4h | Medium |
| 44 | Add logout → clear IndexedDB | 1h | Low |
| 45 | Performance testing & optimization | 4h | Medium |
| 46 | End-to-end offline testing | 6h | High |
| 47 | Edge case handling (quota, corrupt IDB, etc.) | 4h | Medium |

---

## 14. Risk Areas & Mitigation

### Risk 1: Data Inconsistency in Complex Operations

**Problem**: Debt payment touches 6 tables. If the optimistic update is wrong, balances will be incorrect.

**Mitigation**:
- Always snapshot before complex operations
- Server is the source of truth — after successful sync, replace local state with server state
- Add a "Recalculate balances" utility that recomputes all account balances from transactions
- Show a subtle "Data may be pending sync" badge on balances derived from pending operations
- **Always run `recalculateBalances()` after initial sync** to ensure consistency

### Risk 2: Conflict Resolution in Financial Data

**Problem**: User makes changes on device A and device B simultaneously.

**Mitigation**:
- For this single-user app, multi-device conflicts are rare but possible
- **Server wins** for all financial data (balances, amounts)
- When a conflict is detected, keep server version and notify user
- If the local change was a new record that conflicted, preserve it as a new record

### Risk 3: IndexedDB Storage Limits

**Problem**: Browsers limit IndexedDB storage.

**Mitigation**:
- **Transactions are the biggest table**. Implement pagination: only store the last 12 months locally
- Add a "compact" operation that removes old synced records
- Monitor storage usage: `navigator.storage.estimate()`
- Show a warning when storage usage exceeds 80%
- Financial data is small text — even 10,000 transactions ≈ 5MB

### Risk 4: IndexedDB Corruption

**Problem**: Browser crashes, power loss, or bugs can corrupt IndexedDB.

**Mitigation**:
- All data is recoverable from the server (re-run initial sync)
- Add a "Reset local data" button in settings that clears IndexedDB and re-syncs
- Detect corruption: if `localDB.open()` fails, delete the database and re-sync
- Wrap critical writes in Dexie transactions for atomicity

### Risk 5: Service Worker Caching Stale API Responses

**Problem**: The current service worker caches API responses. With local-first, the SW should NOT intercept mutation queue pushes.

**Mitigation**:
- Update the service worker to:
  - Cache GET requests normally (for sync pulls)
  - **Never cache POST/PUT/DELETE** requests (they go through the mutation queue)
  - When offline, the mutation queue handles offline writes; the SW doesn't need to

### Risk 6: Race Conditions Between Pull and Push

**Problem**: If a pull happens while a push is in progress, we might overwrite local changes.

**Mitigation**:
- **Always pull before push** (not push before pull)
- Use a mutex lock on the sync engine (`isPushing` / `isPulling` flags)
- If a pull brings in changes that conflict with pending mutations, resolve conflicts after the current push completes

### Risk 7: Performance Regression During Transition

**Problem**: Dual-read strategy might be slower than the current API-only approach.

**Mitigation**:
- In Phase 1, the background API fetch is non-blocking — users see data from IDB instantly
- Measure timing before and after migration
- Optimize with pre-computed indexes, bulk reads, and lazy loading for large tables

### Risk 8: Budget `spent` Computation is Server-Side

**Problem**: Currently, `budget.spent` is computed by incrementing on each transaction. This could drift in offline mode.

**Mitigation**:
- **Recompute `spent` locally from transactions** on every transaction change
- This is O(transactions_in_category) but categories are small (<100 each)
- More robust than the increment approach — self-healing on every sync

### Risk 9: Logout / User Switching

**Problem**: If User A logs out and User B logs in, User A's data is still in IndexedDB.

**Mitigation**:
- On logout, clear all IndexedDB data: `localDB.delete()` then recreate
- Add this to the `signOut()` callback in next-auth

### Risk 10: Next.js SSR + IndexedDB

**Problem**: IndexedDB is a browser API — it doesn't exist during server-side rendering.

**Mitigation**:
- All Dexie code must be in `'use client'` components
- `useLiveQuery` returns `undefined` during SSR (handled as "loading")
- The `LocalDBProvider` should only mount on the client side
- Use `dynamic(() => import(...), { ssr: false })` for the sync provider if needed

---

## Appendix A: Server-Side Changes Required

1. **New Prisma model**: `DeletedRecord` (tombstone for deletions)
2. **New API routes**: `/api/sync/initial`, `/api/sync/pull`
3. **Modified API routes**: All DELETE routes must create a `DeletedRecord`
4. **No changes** to existing CRUD routes — they continue to work as-is for mutation replay

## Appendix B: CUID Generation Client-Side

```typescript
// src/lib/local/client-id.ts

let counter = 0;

export function generateCUID(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  const count = (counter++).toString(36);
  return `c${timestamp}${random}${count}`;
}
```

## Appendix C: Feature Flag

Use an environment variable to toggle between server-first and local-first during migration:

```typescript
// src/lib/local/flags.ts

export const USE_LOCAL_FIRST = process.env.NEXT_PUBLIC_LOCAL_FIRST === 'true';

// In components during transition:
export function useAccounts() {
  if (USE_LOCAL_FIRST) {
    return useLocalAccounts();
  }
  return useServerAccounts(); // existing apiFetch pattern
}
```

This allows A/B testing and gradual rollout without breaking existing functionality.
