/**
 * Decimal Serialization & Arithmetic Patch for Prisma
 *
 * PROBLEM:
 *   Prisma uses Decimal type for monetary fields (SQLite stores as TEXT).
 *   Prisma.Decimal objects have a valueOf() that returns a STRING like "800000.00".
 *   This causes two catastrophic bugs:
 *
 *   1. JSON serialization: Decimal.toJSON() returns a string → API sends {"balance":"800000"}
 *      instead of {"balance":800000}. Frontend receives strings instead of numbers.
 *
 *   2. Arithmetic: 0 + Decimal("800000") calls valueOf() → "800000" (string)
 *      → JavaScript does STRING CONCATENATION: "0" + "800000" = "0800000"
 *      → Multiple accounts: "0800000" + "500000" = "08000000500000" (8 trillion!)
 *      → Invalid accumulation: "0800000.00500000.00" → NaN → formatCurrency(NaN) = $0
 *
 * SOLUTION (3 layers of defense):
 *
 *   Layer 1 — NextResponse.json patch with PRE-WALK serialization (PRIMARY, most reliable):
 *     Overrides NextResponse.json to walk the data tree BEFORE JSON.stringify,
 *     converting Decimal objects to numbers by their INTERNAL PROPERTIES (d, e, s arrays),
 *     not by instanceof. This works regardless of how Next.js/Turbopack bundles the Decimal
 *     class (which may create duplicate copies with their own prototype methods).
 *
 *     IMPORTANT: The previous "replacer" approach failed because JSON.stringify calls
 *     toJSON() on objects BEFORE passing them to the replacer. When the prototype patch
 *     didn't apply (different Decimal class instance from bundling), toJSON() returned
 *     a string, and the replacer couldn't detect the original Decimal object.
 *     Pre-walking avoids this by converting Decimal objects BEFORE JSON.stringify sees them.
 *
 *   Layer 2 — Prototype patches (DEFENSE-IN-DEPTH):
 *     Patches Decimal.prototype.toJSON and valueOf to return numbers.
 *     Works when the same Decimal class is used throughout the bundle.
 *     May NOT work when Turbopack creates separate copies of the Decimal class.
 *
 *   Layer 3 — Defensive Number() in frontend (SAFETY NET):
 *     Frontend reduce/formatCurrency always wraps values in Number()
 *     to handle any remaining string values from stale caches or edge cases.
 *
 * IMPORTANT: This file must be imported BEFORE any Prisma query.
 * It's imported by db.ts which is the first file loaded in any API route.
 */

import { Decimal } from '@prisma/client/runtime/library';
import { NextResponse } from 'next/server';

// ============================================================
// LAYER 1: NextResponse.json patch with PRE-WALK serialization
// ============================================================
// This is the PRIMARY fix. It works by walking the data tree BEFORE
// JSON.stringify, converting ALL Decimal objects to numbers regardless
// of which copy of the Decimal class they belong to (handles bundling duplication).

/**
 * Detect a decimal.js/Prisma.Decimal object by its internal properties.
 * This is MORE RELIABLE than instanceof because:
 *   - Next.js/Turbopack may create duplicate Decimal classes in different chunks
 *   - instanceof fails across different copies of the same class
 *   - Internal properties (d, e, s) are consistent across all copies
 *
 * decimal.js internal structure:
 *   d: number[] — array of digits (e.g., [800000, 0] or [1234567, 8900000])
 *   e: number   — exponent (position of decimal point)
 *   s: number   — sign (1 for positive, -1 for negative)
 */
export function isDecimalLike(value: unknown): boolean {
  if (value === null || value === undefined || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.d) &&
    typeof obj.e === 'number' &&
    typeof obj.s === 'number' &&
    typeof obj.toString === 'function'
  );
}

/**
 * Recursively convert all Decimal objects in a data structure to numbers.
 * Called BEFORE JSON.stringify to ensure Decimal objects are converted
 * regardless of whether the prototype patches are effective.
 *
 * IMPORTANT: Uses `typeof obj === 'object' && obj !== null && !Array.isArray(obj)`
 * instead of `obj.constructor === Object` because Prisma model instances
 * have their own constructor (not plain Object), so the old check would
 * skip Decimal fields inside Prisma results.
 */
export function serializeDecimals<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj; // Preserve Date objects (don't iterate keys)
  if (isDecimalLike(obj)) {
    return Number((obj as { toString: () => string }).toString()) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeDecimals) as T;
  }
  if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      result[key] = serializeDecimals((obj as Record<string, unknown>)[key]);
    }
    return result as T;
  }
  return obj;
}

// Patch NextResponse.json to pre-walk the data tree and convert Decimals
const originalNextResponseJson = NextResponse.json;

(NextResponse as unknown as Record<string, unknown>).json = function (
  data: unknown,
  init?: ResponseInit
): NextResponse {
  // PRE-WALK: Convert all Decimal objects to numbers BEFORE JSON.stringify
  // This is more reliable than a JSON.stringify replacer because:
  //   1. It handles Decimal objects from any class instance (handles bundling duplication)
  //   2. It doesn't depend on toJSON() or valueOf() prototype patches
  //   3. It works with Prisma model instances that have non-Object constructors
  const serialized = serializeDecimals(data);
  const body = JSON.stringify(serialized);
  return new NextResponse(body, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
};

// ============================================================
// LAYER 2: Prototype patches (defense-in-depth)
// ============================================================
// These patches make Decimal objects work correctly in server-side
// arithmetic (e.g., monthly summary aggregation) and as a backup
// for JSON serialization. They MAY NOT work if Turbopack creates
// separate copies of the Decimal class in different chunks.

// Patch toJSON: Decimal → number in JSON responses
// Uses toString() to avoid circular call (Number(this) would call valueOf() again)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Decimal.prototype as any).toJSON = function (this: {
  toString: () => string;
}): number {
  return Number(this.toString());
};

// Patch valueOf: Decimal → number for JS arithmetic operators
// Without this: 0 + Decimal("100") → "0100" (string concatenation!)
// With this:    0 + Decimal("100") → 100 (number addition!)
//
// Uses Number(this.toString()) instead of Number(this) to avoid INFINITE RECURSION:
//   Number(decimalObj) → calls valueOf() → return Number(this) → calls valueOf() → ...
//   Number(this.toString()) → toString() returns "100.00" → Number("100.00") = 100 ✓
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Decimal.prototype as any).valueOf = function (this: {
  toString: () => string;
}): number {
  return Number(this.toString());
};

// ============================================================
// EXPORTS: Utility functions for explicit Decimal conversion
// ============================================================

/**
 * Convert a value to a safe number for arithmetic operations.
 * Handles: Prisma.Decimal, strings, numbers, null, undefined.
 * Returns 0 for NaN/null/undefined (safe for reduce operations).
 *
 * IMPORTANT: Always use toNumber() when doing arithmetic with Prisma
 * Decimal values in API routes. Example:
 *
 *   // BAD — string concatenation if valueOf patch doesn't apply:
 *   total += tx.amount;
 *
 *   // GOOD — always produces a number:
 *   total += toNumber(tx.amount);
 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = Number(value);
    return Number.isNaN(num) ? 0 : num;
  }
  if (isDecimalLike(value)) {
    return Number((value as { toString: () => string }).toString());
  }
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

console.log('[Decimal] NextResponse.json PRE-WALK patch + prototype patches applied (3-layer defense)');
