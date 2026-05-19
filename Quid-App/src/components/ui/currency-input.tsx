"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps extends Omit<React.ComponentProps<"input">, "onChange" | "type" | "value"> {
  /** The numeric value (raw number, e.g. 7800000.50) */
  value: number | string;
  /** Called with the raw numeric value whenever it changes */
  onChange: (value: string) => void;
  /** Whether to show the $ prefix (default: false) */
  showPrefix?: boolean;
  /** Whether to allow decimal values (default: true for financial apps) */
  allowDecimals?: boolean;
  /** Maximum decimal digits (default: 2) */
  maxDecimals?: number;
  /** Placeholder text */
  placeholder?: string;
}

/**
 * Formats the integer part of a number with thousands separators (dots for Colombian locale).
 * The decimal part is kept as-is.
 * E.g. 7800000.50 → "7.800.000,50"
 * E.g. 7800000 → "7.800.000"
 */
function formatWithSeparators(num: number, allowDecimals: boolean, maxDecimals: number = 2): string {
  if (isNaN(num)) return "";

  if (allowDecimals) {
    return new Intl.NumberFormat("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    }).format(num);
  }

  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Formats only the integer part with thousand separators, preserving
 * the decimal part as typed by the user (no rounding while typing).
 * E.g. "1500000,5" → "1.500.000,5"
 * E.g. "1500000," → "1.500.000,"
 */
function formatIntegerPartPreserveDecimal(rawStr: string, maxDecimals: number = 2): string {
  // Determine which separator is the decimal one
  // Support both comma and dot as decimal separator input
  let decimalSep = "";
  let integerPart = rawStr;
  let decimalPart = "";

  // Find the LAST comma or dot that could be a decimal separator
  // In es-CO: comma is decimal, dot is thousands
  // But while typing, user might type dot for decimal too
  const lastComma = rawStr.lastIndexOf(",");
  const lastDot = rawStr.lastIndexOf(".");

  if (lastComma !== -1 && lastComma > lastDot) {
    // Comma is the decimal separator
    decimalSep = ",";
    integerPart = rawStr.substring(0, lastComma);
    decimalPart = rawStr.substring(lastComma + 1);
  } else if (lastDot !== -1 && lastComma === -1) {
    // Only dots present — check if it could be a decimal separator
    // If there are multiple dots, they're all thousands separators
    const dotCount = (rawStr.match(/\./g) || []).length;
    if (dotCount === 1) {
      // Single dot — could be decimal or thousands
      // Check if digits after dot are 3 or fewer and look like decimal input
      const afterDot = rawStr.substring(lastDot + 1);
      const beforeDot = rawStr.substring(0, lastDot);
      if (afterDot.length <= maxDecimals && beforeDot.length <= 3 && !beforeDot.includes(".")) {
        // Likely a decimal separator (e.g. "100.5" → 100.5)
        // But also could be "1.000" → 1000 — ambiguous
        // We'll treat single dot followed by <= 2 digits as decimal only if before is <=3 digits
        // Otherwise treat as thousands separator
        if (afterDot.length > 0 && afterDot.length <= maxDecimals) {
          decimalSep = ",";
          integerPart = beforeDot;
          decimalPart = afterDot;
        } else {
          // "1.000" — treat as thousands, convert to standard
          integerPart = rawStr.replace(/\./g, "");
        }
      } else {
        // Multiple digits before dot or digits after > 2 — thousands separator
        integerPart = rawStr.replace(/\./g, "");
      }
    } else {
      // Multiple dots — all are thousands separators
      integerPart = rawStr.replace(/\./g, "");
    }
  } else if (lastDot !== -1 && lastComma !== -1) {
    // Both present — dots are thousands, comma is decimal (es-CO standard)
    decimalSep = ",";
    integerPart = rawStr.substring(0, lastComma);
    decimalPart = rawStr.substring(lastComma + 1);
    // Remove thousands dots from integer part
    integerPart = integerPart.replace(/\./g, "");
  }

  // Clean integer part — remove any remaining non-digit chars
  integerPart = integerPart.replace(/[^\d]/g, "");

  if (!integerPart) return rawStr;

  // Format integer part with thousands separators
  const intNum = parseInt(integerPart, 10);
  if (isNaN(intNum)) return rawStr;

  const formattedInt = new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(intNum);

  if (decimalSep) {
    // Limit decimal part to maxDecimals digits
    const trimmedDecimal = decimalPart.substring(0, maxDecimals);
    if (trimmedDecimal || decimalPart === "") {
      // User has typed something after comma or just typed the comma
      return `${formattedInt},${trimmedDecimal}`;
    }
    return formattedInt;
  }

  return formattedInt;
}

/**
 * Parses a formatted string back to a raw numeric string.
 * E.g. "7.800.000,50" → "7800000.50"
 * E.g. "7.800.000" → "7800000"
 */
function parseFormattedValue(str: string, allowDecimals: boolean): string {
  if (!str) return "";

  // Remove $ signs and spaces
  let cleaned = str.replace(/[\$\s]/g, "");

  if (allowDecimals) {
    // In es-CO: comma is decimal separator, dot is thousands separator
    // Remove dots (thousands), then convert comma to dot for JS number
    cleaned = cleaned.replace(/\./g, "");
    cleaned = cleaned.replace(",", ".");
  } else {
    // No decimals: remove all dots and commas
    cleaned = cleaned.replace(/[.,]/g, "");
  }

  const num = parseFloat(cleaned);
  if (isNaN(num)) return "";

  if (allowDecimals) {
    return cleaned;
  }
  return Math.round(num).toString();
}

/**
 * CurrencyInput — A text input that automatically formats numbers with
 * thousands separators (dots for Colombian pesos) while the user types.
 *
 * - Stores/returns raw numeric values (e.g. "7800000.50")
 * - Displays formatted values (e.g. "7.800.000,50")
 * - Uses inputMode="decimal" for proper mobile keyboard with decimal key
 * - Does NOT auto-focus (prevents unwanted keyboard on mobile)
 * - allowDecimals defaults to TRUE (essential for financial apps)
 */
export function CurrencyInput({
  value,
  onChange,
  showPrefix = false,
  allowDecimals = true,
  maxDecimals = 2,
  placeholder = "0",
  className,
  disabled,
  ...rest
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update display when value changes externally (and not focused)
  useEffect(() => {
    if (!isFocused) {
      const num = typeof value === "string" ? parseFloat(value) : value;
      if (!value || value === "" || value === "0" || (isNaN(num) && value !== "")) {
        setDisplayValue(value === "" ? "" : value.toString());
      } else {
        setDisplayValue(formatWithSeparators(num, allowDecimals, maxDecimals));
      }
    }
  }, [value, isFocused, allowDecimals, maxDecimals]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawInput = e.target.value;

      // Allow empty input
      if (rawInput === "") {
        setDisplayValue("");
        onChange("");
        return;
      }

      // Strip everything except digits, dots and commas
      let cleaned = rawInput.replace(/[^\d.,]/g, "");

      if (allowDecimals) {
        // Ensure only one decimal separator (the last comma or, if no comma, treat carefully)
        // Find all commas
        const commaCount = (cleaned.match(/,/g) || []).length;
        if (commaCount > 1) {
          // Keep only the last comma as decimal separator
          const lastCommaIdx = cleaned.lastIndexOf(",");
          cleaned = cleaned.substring(0, lastCommaIdx).replace(/,/g, "") + cleaned.substring(lastCommaIdx);
        }

        // If there's a comma (decimal separator), limit digits after it
        const commaIdx = cleaned.indexOf(",");
        if (commaIdx !== -1) {
          const intPart = cleaned.substring(0, commaIdx);
          let decPart = cleaned.substring(commaIdx + 1);
          // Limit decimal digits
          decPart = decPart.substring(0, maxDecimals);
          cleaned = intPart + "," + decPart;
        }
      } else {
        // No decimals: remove all dots and commas
        cleaned = cleaned.replace(/[.,]/g, "");
      }

      if (cleaned === "" || cleaned === "," || cleaned === ".") {
        setDisplayValue("");
        onChange("");
        return;
      }

      // While typing, format integer part but preserve decimal part as-is
      let formatted: string;
      let numericValue: string;

      if (allowDecimals) {
        formatted = formatIntegerPartPreserveDecimal(cleaned, maxDecimals);
        numericValue = parseFormattedValue(formatted, true);
      } else {
        const numValue = parseInt(cleaned, 10);
        if (isNaN(numValue)) return;
        formatted = formatWithSeparators(numValue, false);
        numericValue = numValue.toString();
      }

      setDisplayValue(formatted);

      if (numericValue && !isNaN(parseFloat(numericValue))) {
        onChange(numericValue);
      } else if (cleaned === "," || cleaned.endsWith(",")) {
        // User just typed decimal separator, don't call onChange yet
        // but keep the display
      }
    },
    [onChange, allowDecimals, maxDecimals]
  );

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // When focusing, show formatted value
      const num = typeof value === "string" ? parseFloat(value) : value;
      if (value && !isNaN(num) && num !== 0) {
        setDisplayValue(formatWithSeparators(num, allowDecimals, maxDecimals));
      }
      // Call any external onFocus handler
      if (rest.onFocus) {
        (rest.onFocus as React.FocusEventHandler<HTMLInputElement>)(e);
      }
    },
    [value, allowDecimals, maxDecimals, rest]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      // Re-format on blur with full formatting
      const num = typeof value === "string" ? parseFloat(value) : value;
      if (value && value !== "" && !isNaN(num)) {
        setDisplayValue(formatWithSeparators(num, allowDecimals, maxDecimals));
      } else if (value === "" || value === "0") {
        setDisplayValue(value === "" ? "" : formatWithSeparators(0, allowDecimals, maxDecimals));
      }
      // Call any external onBlur handler
      if (rest.onBlur) {
        (rest.onBlur as React.FocusEventHandler<HTMLInputElement>)(e);
      }
    },
    [value, allowDecimals, maxDecimals, rest]
  );

  // Handle keyboard input
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow: backspace, delete, tab, escape, enter, arrows
      if (
        [8, 9, 13, 27, 46, 37, 38, 39, 40].includes(e.keyCode) ||
        // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        ((e.ctrlKey || e.metaKey) && [65, 67, 86, 88].includes(e.keyCode))
      ) {
        return;
      }
      // Block non-numeric input (except decimal separator when allowed)
      if (
        (e.keyCode < 48 || e.keyCode > 57) &&
        (e.keyCode < 96 || e.keyCode > 105)
      ) {
        if (allowDecimals && (e.key === "," || e.key === ".")) {
          // Check if decimal separator already exists in the input
          const currentVal = displayValue;
          if (currentVal.includes(",")) {
            e.preventDefault(); // Already has a decimal separator
          }
          return;
        }
        e.preventDefault();
      }
    },
    [allowDecimals, displayValue]
  );

  return (
    <div className="relative">
      {showPrefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
          $
        </span>
      )}
      <Input
        ref={inputRef}
        inputMode={allowDecimals ? "decimal" : "numeric"}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(showPrefix && "pl-7", className)}
        autoComplete="off"
        {...rest}
      />
    </div>
  );
}
