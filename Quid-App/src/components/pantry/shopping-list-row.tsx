"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShoppingListItem } from "@/lib/types";

/**
 * Compact conversion row (fila-edit) shown in the market-purchase confirm dialog.
 * One line per item: checkbox (the "goes to stock" selector) · name ·
 * compact quantity stepper (− n +) · unit · optional "mín" pilot.
 * Subtle by design: no heavy cards, no static chips — the gesture reveals state.
 */
interface ShoppingListRowProps {
  item: ShoppingListItem;
  selected: boolean;
  minMode: boolean; // list-level "Recordar mínimos" toggle
  editing: boolean; // this row's stepper is being adjusted
  quantity: number; // current (stepper) value
  onChangeQuantity: (q: number) => void;
  onToggle: () => void;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function ShoppingListRow({
  item,
  selected,
  minMode,
  editing,
  quantity,
  onChangeQuantity,
  onToggle,
}: ShoppingListRowProps) {
  const unitShort =
    {
      unit: "unid",
      lb: "lb",
      kg: "kg",
      g: "g",
      oz: "oz",
      ml: "ml",
      l: "L",
      package: "paq",
      bottle: "bot",
      can: "lata",
    }[item.unit] || item.unit;

  return (
    <li
      className={cn(
        "flex items-center gap-3 px-4 py-2.5",
        "border-b border-border/50 transition-colors",
        editing && "rounded-lg border-b-transparent bg-card/70"
      )}
    >
      {/* Checkbox = "esto va a stock" (cubre Todo y el modo granulado) */}
      <button
        type="button"
        aria-label={selected ? "Quitar de la conversión" : "Agregar a la conversión"}
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-sm border transition-colors",
          selected
            ? "border-accent bg-accent text-accent-foreground"
            : "border-border text-transparent hover:border-accent"
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </button>

      <span
        className={cn(
          "flex-1 truncate text-sm",
          selected ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {item.name}
      </span>

      {minMode && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
          title="Se fijará como stock mínimo"
          aria-label="Se fijará como stock mínimo"
        />
      )}

      {/* Compact stepper: the gesture reveals the editing state */}
      <div
        className={cn(
          "flex items-center gap-0.5 rounded-md border text-sm",
          editing
            ? "border-border bg-background"
            : "border-transparent text-muted-foreground"
        )}
      >
        <button
          type="button"
          aria-label="Disminuir cantidad"
          onClick={(e) => {
            e.preventDefault();
            onChangeQuantity(round1(Math.max(0, quantity - 1)));
          }}
          className="flex size-6 items-center justify-center rounded-l-md text-muted-foreground hover:text-foreground"
        >
          −
        </button>
        <span className="min-w-6 text-center tabular-nums">{quantity}</span>
        <button
          type="button"
          aria-label="Aumentar cantidad"
          onClick={(e) => {
            e.preventDefault();
            onChangeQuantity(round1(quantity + 1));
          }}
          className="flex size-6 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
        >
          +
        </button>
      </div>

      <span className="shrink-0 text-xs text-muted-foreground">{unitShort}</span>
    </li>
  );
}