"use client";

import { useState } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { motion } from "framer-motion";

interface PantryItemCardProps {
  item: {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    deficit?: number;
    targetQuantity?: number | null;
    lastUsedAt?: string | null;
  };
  onEdit: () => void;
  onRefresh: () => void;
}

const unitLabels: Record<string, string> = {
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
};

function shortUnit(u: string): string {
  return unitLabels[u] || u;
}

/** Compute an age hint for the "lleva X días / hace X días" nudge. */
function ageText(lastUsedAt?: string | null): string | null {
  const base = lastUsedAt ? new Date(lastUsedAt) : null;
  if (!base || isNaN(base.getTime())) return null;
  const days = Math.floor((Date.now() - base.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return null;
  if (days === 1) return "sin usar hoy";
  if (days < 7) return `hace ${days} días`;
  return `hace ${Math.floor(days / 7)} sem ${days % 7 ? `+${days % 7}d` : ""}`;
}

export function PantryItemCard({ item, onEdit, onRefresh }: PantryItemCardProps) {
  const [deleting, setDeleting] = useState(false);

  const deficit = item.deficit ?? Math.max(0, (item.targetQuantity ?? item.quantity) - item.quantity);
  // Health dot: low/needs restock (deficit>0) vs ok
  const isLow = deficit > 0;
  const hasTarget = item.targetQuantity !== null && item.targetQuantity !== undefined;
  const age = ageText(item.lastUsedAt);

  const subtitle = isLow
    ? `te falta ${deficit} ${shortUnit(item.unit)}`
    : hasTarget
      ? `objetivo ${item.targetQuantity} ${shortUnit(item.unit)}`
      : age
        ? age
        : null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiFetch(`/api/pantry/${item.id}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      whileTap={{ scale: 0.99 }}
      className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white/90 px-2.5 py-2 shadow-sm dark:border-gray-700 dark:bg-gray-800/90"
    >
      <span
        className={`size-2 shrink-0 rounded-full ${isLow ? "bg-amber-500" : "bg-emerald-500"}`}
        aria-hidden
      />
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{item.name}</p>
        {subtitle && (
          <p className={`mt-0.5 truncate text-[11px] ${isLow ? "text-amber-600 dark:text-amber-400" : "text-gray-500"}`}>
            {subtitle}
          </p>
        )}
      </button>
      <span className="shrink-0 text-[13px] font-semibold text-gray-900 dark:text-white">
        {item.quantity} <small className="font-normal text-gray-400">{shortUnit(item.unit)}</small>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7 shrink-0">
            <MoreVertical className="size-3.5 text-gray-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-xl">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 size-3.5" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDelete} disabled={deleting} className="text-red-500 focus:text-red-500">
            <Trash2 className="mr-2 size-3.5" /> Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  );
}