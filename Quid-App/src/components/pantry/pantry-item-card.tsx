"use client";

import { useState } from "react";
import { apiFetch, formatCurrency, formatShortDate } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Trash2, AlertTriangle, Clock } from "lucide-react";
import { motion } from "framer-motion";

interface PantryItemCardProps {
  item: {
    id: string;
    name: string;
    category: string | null;
    quantity: number;
    unit: string;
    expirationDate: string | null;
    purchaseDate: string | null;
    purchasePrice: number | null;
    minStock: number | null;
  };
  onEdit: () => void;
  onDelete: () => void;
  categoryColor: string;
}

const unitLabels: Record<string, string> = {
  unit: "Unidad",
  lb: "Libra",
  kg: "Kilogramo",
  g: "Gramo",
  oz: "Onza",
  ml: "Mililitro",
  l: "Litro",
  package: "Paquete",
  bottle: "Botella",
  can: "Lata",
};

function getExpirationStatus(date: string | null): { color: string; label: string; icon: typeof Clock } {
  if (!date) return { color: "", label: "", icon: Clock };
  const exp = new Date(date);
  const now = new Date();
  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { color: "text-red-500", label: "Vencido", icon: AlertTriangle };
  }
  if (diffDays <= 3) {
    return { color: "text-amber-500", label: `${diffDays}d`, icon: AlertTriangle };
  }
  if (diffDays <= 7) {
    return { color: "text-yellow-500", label: `${diffDays}d`, icon: Clock };
  }
  return { color: "text-green-500", label: formatShortDate(date), icon: Clock };
}

export function PantryItemCard({ item, onEdit, onDelete, categoryColor }: PantryItemCardProps) {
  const [deleting, setDeleting] = useState(false);
  const isLowStock =
    item.minStock !== null &&
    item.minStock !== undefined &&
    item.quantity < item.minStock;
  const expStatus = getExpirationStatus(item.expirationDate);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiFetch(`/api/pantry/${item.id}`, { method: "DELETE" });
      onDelete();
    } catch (error) {
      console.error("Error deleting item:", error);
    } finally {
      setDeleting(false);
    }
  };

  const handleQuickQuantity = async (delta: number) => {
    try {
      const newQty = Math.max(0, item.quantity + delta);
      await apiFetch(`/api/pantry/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ quantity: newQty }),
      });
      onDelete(); // refresh
    } catch (error) {
      console.error("Error updating quantity:", error);
    }
  };

  return (
    <motion.div
      whileTap={{ scale: 0.99 }}
      className={`rounded-xl border bg-white/90 px-2.5 py-2 shadow-sm dark:bg-gray-800/90 ${
        isLowStock ? "border-amber-300 dark:border-amber-700" : "border-gray-100 dark:border-gray-700"
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-1.5">
            {isLowStock && <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />}
            <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {item.name}
            </h3>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden text-[11px] text-gray-500">
            <span className={isLowStock ? "font-semibold text-amber-600 dark:text-amber-400" : ""}>
              {item.quantity} {unitLabels[item.unit] || item.unit}
            </span>
            {item.minStock !== null && item.minStock !== undefined && (
              <span className="shrink-0">mín {item.minStock}</span>
            )}
            {item.purchasePrice && (
              <span className="shrink-0">{formatCurrency(item.purchasePrice)}</span>
            )}
            {item.expirationDate && (
              <span className={`flex shrink-0 items-center gap-0.5 ${expStatus.color}`}>
                <expStatus.icon className="size-3" />
                {expStatus.label}
              </span>
            )}
          </div>
        </button>

        {isLowStock && (
          <Badge className="h-5 shrink-0 bg-amber-100 px-1.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            Falta
          </Badge>
        )}

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={() => handleQuickQuantity(-1)}
            className="size-7 rounded-lg bg-gray-100 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
          >
            -
          </button>
          <button
            onClick={() => handleQuickQuantity(1)}
            className="size-7 rounded-lg bg-amber-100 text-xs font-bold text-amber-600 transition-colors hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-800/30"
          >
            +
          </button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 shrink-0">
              <MoreVertical className="size-3.5 text-gray-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="size-3.5 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDelete}
              disabled={deleting}
              className="text-red-500 focus:text-red-500"
            >
              <Trash2 className="size-3.5 mr-2" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
