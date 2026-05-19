"use client";

import { useState } from "react";
import { apiFetch, formatCurrency, formatShortDate } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
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
  const isLowStock = item.minStock ? item.quantity < item.minStock : false;
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
      if (newQty === 0) {
        await apiFetch(`/api/pantry/${item.id}`, { method: "DELETE" });
      } else {
        await apiFetch(`/api/pantry/${item.id}`, {
          method: "PUT",
          body: JSON.stringify({ quantity: newQty }),
        });
      }
      onDelete(); // refresh
    } catch (error) {
      console.error("Error updating quantity:", error);
    }
  };

  return (
    <motion.div whileTap={{ scale: 0.98 }} whileHover={{ scale: 1.01 }}>
      <Card className="border-0 shadow-sm rounded-xl bg-white dark:bg-gray-800">
        <CardContent className="p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0" onClick={onEdit}>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {item.name}
                </h3>
                {isLowStock && (
                  <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">
                  {item.quantity} {unitLabels[item.unit] || item.unit}
                </span>

                {item.expirationDate && (
                  <span className={`text-[10px] flex items-center gap-0.5 ${expStatus.color}`}>
                    <expStatus.icon className="size-3" />
                    {expStatus.label}
                  </span>
                )}

                {item.purchasePrice && (
                  <span className="text-[10px] text-gray-400">
                    {formatCurrency(item.purchasePrice)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Quick quantity buttons */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => handleQuickQuantity(-1)}
                  className="size-6 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <span className="text-xs font-bold">-</span>
                </button>
                <button
                  onClick={() => handleQuickQuantity(1)}
                  className="size-6 rounded-md bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 hover:bg-amber-200 dark:hover:bg-amber-800/30 transition-colors"
                >
                  <span className="text-xs font-bold">+</span>
                </button>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7">
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
          </div>

          {/* Low stock warning bar */}
          {isLowStock && (
            <div className="mt-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <AlertTriangle className="size-3 text-amber-500" />
              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                Stock bajo (mín: {item.minStock} {unitLabels[item.unit] || item.unit})
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
