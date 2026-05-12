/**
 * Decimal Serialization & Arithmetic Patch for Prisma
 *
 * When Prisma uses Decimal type (SQLite stores as TEXT), it returns
 * Prisma.Decimal objects instead of plain JavaScript numbers.
 *
 * This utility patches TWO methods on Prisma.Decimal.prototype:
 *
 * 1. toJSON() — so JSON.stringify (used by NextResponse.json) converts
 *    Decimal values to numbers automatically in API responses.
 *
 * 2. valueOf() — so JavaScript arithmetic operators (+, -, *, /, %)
 *    work correctly with Decimal objects. Without this patch:
 *      0 + Decimal("100") → "0100" (string concatenation!)
 *    With this patch:
 *      0 + Decimal("100") → 100 (number addition!)
 *
 * IMPORTANT: We use Number(this.toString()) instead of Number(this)
 * to avoid INFINITE RECURSION:
 *   Number(decimalObj) → calls valueOf() → return Number(this) → calls valueOf() → ...
 *   Number(this.toString()) → toString() returns "100.00" → Number("100.00") = 100 ✓
 *
 * This means NO changes are needed in API routes — all arithmetic
 * on Decimal values (sum, reduce, increment, etc.) works automatically.
 *
 * IMPORTANT: This file must be imported BEFORE any Prisma query.
 * It's imported by db.ts which is the first file loaded in any API route.
 */

import { Decimal } from '@prisma/client/runtime/library';

// Patch toJSON: Decimal → number in JSON responses
// Uses toString() to avoid circular call (Number(this) would call valueOf() again)
(Decimal.prototype as any).toJSON = function (this: any) {
  return Number(this.toString());
};

// Patch valueOf: Decimal → number for JS arithmetic operators
// This is THE KEY FIX for the "$0" and "$80.000.052.323" bugs.
//
// Background: Prisma.Decimal extends decimal.js, whose original valueOf()
// returns a STRING like "100.00". When JS sees 0 + Decimal("100"),
// it calls valueOf(), gets "100" (a string), and does string
// concatenation: "0" + "100" = "0100". Then Math.round("0100") = NaN.
//
// With Number(this): creates infinite recursion (valueOf → Number(this) → valueOf → ...)
// With Number(this.toString()): toString() returns "100.00", Number("100.00") = 100
// Then 0 + 100 = 100, and Math.round(100) = 100. ✓
(Decimal.prototype as any).valueOf = function (this: any) {
  return Number(this.toString());
};

console.log('[Decimal] Serialization + Arithmetic patch applied');
