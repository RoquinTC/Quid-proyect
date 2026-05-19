"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

interface DaySelectProps {
  /** Currently selected day (1-31) */
  value: number | string;
  /** Called when a day is selected */
  onValueChange: (day: number) => void;
  /** Placeholder text when no day is selected */
  placeholder?: string;
  /** Additional CSS class for the trigger */
  className?: string;
  /** Whether the select is disabled */
  disabled?: boolean;
}

/**
 * DaySelect — A dropdown select for choosing a day of the month (1-31).
 * Replaces type="number" inputs that are hard to use on mobile.
 *
 * - Shows "Día 1", "Día 2", ... "Día 31"
 * - Uses native <Select> dropdown (no keyboard needed)
 * - Always valid (can't type 45 or leave empty)
 */
export function DaySelect({
  value,
  onValueChange,
  placeholder = "Seleccionar día",
  className,
  disabled,
}: DaySelectProps) {
  const stringValue = value !== undefined && value !== null && value !== ""
    ? value.toString()
    : "";

  return (
    <Select
      value={stringValue}
      onValueChange={(v) => onValueChange(parseInt(v, 10))}
      disabled={disabled}
    >
      <SelectTrigger className={`rounded-xl ${className || ""}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-48">
        {DAYS_OF_MONTH.map((d) => (
          <SelectItem key={d} value={d.toString()}>
            Día {d}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
