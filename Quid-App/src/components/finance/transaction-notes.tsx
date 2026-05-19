"use client";

import { formatCurrency } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

// ─── Types ───

interface InstallmentDetail {
  installmentId: string;
  description: string;
  amount: number;
  category: string | null;
  subCategory: string | null;
  currentInstallment: number;
  totalInstallments: number;
}

interface TransactionNotesProps {
  notes: string | null | undefined;
  isCcPayment?: boolean;
  /** Text size variant: "sm" for account-detail compact view, "md" for transaction-list */
  size?: "sm" | "md";
}

// ─── Parser ───

/**
 * Parse CC payment notes into structured installment details.
 * Notes format: "installmentIds:id1,id2 | [{...json...}]"
 * Also handles legacy format: "installmentIds:id1 | Cuota 1/1 de ..."
 */
export function parseCcPaymentDetails(notes: string): InstallmentDetail[] {
  try {
    // Extract the JSON part (after the pipe separator)
    const pipeIndex = notes.indexOf(" | ");
    if (pipeIndex === -1) return [];

    const jsonPart = notes.substring(pipeIndex + 3);

    // Try to parse as JSON array
    const parsed = JSON.parse(jsonPart);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

/**
 * Check if notes contain CC payment structured data
 */
export function isCcPaymentNotes(notes: string | null | undefined): boolean {
  if (!notes) return false;
  return notes.startsWith("installmentIds:");
}

/**
 * Check if notes contain abono (capital payment) structured data
 */
export function isAbonoNotes(notes: string | null | undefined): boolean {
  if (!notes) return false;
  return notes.includes("installmentIds:") && notes.startsWith("Abono a capital:");
}

/**
 * Parse abono notes to extract purchase names
 */
export function parseAbonoNotes(notes: string): { names: string[]; installmentIds: string[] } {
  try {
    // Format: "Abono a capital: name1, name2 | installmentIds: id1,id2"
    const pipeIndex = notes.indexOf(" | ");
    if (pipeIndex === -1) return { names: [], installmentIds: [] };

    const namesPart = notes.substring("Abono a capital: ".length, pipeIndex);
    const idsPart = notes.substring(pipeIndex + 3);

    const names = namesPart.split(", ").filter(Boolean);
    const idsMatch = idsPart.match(/installmentIds:\s*(.+)/);
    const installmentIds = idsMatch ? idsMatch[1].split(",").filter(Boolean) : [];

    return { names, installmentIds };
  } catch {
    return { names: [], installmentIds: [] };
  }
}

// ─── Category color mapping ───

const categoryColors: Record<string, string> = {
  Alimentación: "bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  Transporte: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  Vivienda: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  Salud: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  Entretenimiento: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  Educación: "bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400",
  Ropa: "bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
  Servicios: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  Deudas: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  Ahorros: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  Inversiones: "bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400",
  Otros: "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function getCategoryClass(category: string | null): string {
  if (!category) return categoryColors.Otros;
  return categoryColors[category] || categoryColors.Otros;
}

// ─── Component ───

export function TransactionNotes({ notes, isCcPayment, size = "sm" }: TransactionNotesProps) {
  if (!notes) return null;

  const isSmall = size === "sm";
  const textXs = isSmall ? "text-[9px]" : "text-[10px]";
  const textSm = isSmall ? "text-[11px]" : "text-xs";
  const badgeText = isSmall ? "text-[8px]" : "text-[9px]";
  const badgePx = isSmall ? "px-1 py-0" : "px-1.5 py-0.5";
  const rowPad = isSmall ? "py-1 px-1.5" : "py-1.5 px-2";

  // CC payment with structured installment details
  if (isCcPayment || isCcPaymentNotes(notes)) {
    const details = parseCcPaymentDetails(notes);

    if (details.length > 0) {
      return (
        <div className="col-span-2">
          <span className={`${textXs} text-gray-400 uppercase tracking-wider font-medium`}>
            Cuotas pagadas
          </span>
          <div className="mt-1 space-y-0.5">
            {details.map((detail, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between ${rowPad} bg-gray-50 dark:bg-gray-700/50 rounded-lg`}
              >
                <div className="min-w-0 flex-1 flex items-center gap-1.5">
                  <span className={`${textSm} font-medium text-gray-700 dark:text-gray-300 truncate`}>
                    {detail.description}
                  </span>
                  <Badge
                    variant="outline"
                    className={`${badgeText} ${badgePx} h-4 rounded-md border-0 shrink-0 ${getCategoryClass(detail.category)}`}
                  >
                    {detail.subCategory && detail.subCategory !== detail.category
                      ? detail.subCategory
                      : detail.category || "Otros"}
                  </Badge>
                  {detail.totalInstallments > 1 && (
                    <span className={`${textXs} text-gray-400 shrink-0`}>
                      {detail.currentInstallment}/{detail.totalInstallments}
                    </span>
                  )}
                </div>
                <span className={`${textSm} font-bold text-gray-600 dark:text-gray-400 ml-2 shrink-0`}>
                  {formatCurrency(detail.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  }

  // Abono (capital payment) notes
  if (isAbonoNotes(notes)) {
    const { names } = parseAbonoNotes(notes);
    return (
      <div className="col-span-2">
        <span className={`${textXs} text-gray-400 uppercase tracking-wider`}>Notas</span>
        <span className={`block ${textSm} text-gray-700 dark:text-gray-300`}>
          Abono a capital: {names.join(", ")}
        </span>
      </div>
    );
  }

  // Regular notes — just display as text
  return (
    <div className="col-span-2">
      <span className={`${textXs} text-gray-400 uppercase tracking-wider`}>Notas</span>
      <span className={`block ${textSm} text-gray-700 dark:text-gray-300`}>
        {notes}
      </span>
    </div>
  );
}
