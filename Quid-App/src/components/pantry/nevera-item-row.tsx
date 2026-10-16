"use client";

import { motion } from "framer-motion";
import {
  Refrigerator,
  Snowflake,
  Package,
  Minus,
  Plus,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { STOCK_CAPSULE_CLASS, formatQuantity } from "./nevera-style";
import type { PantryItem } from "@/lib/types/pantry";

/**
 * Icono de la ubicación. Da carácter sin agregar imágenes: el frío y el
 * congelador comparten familia visual, la alacena es lo seco.
 */
function LocationIcon({ location }: { location?: string }) {
  const className = "size-4 shrink-0";
  if (location === "congelador") return <Snowflake className={`${className} text-cyan-500`} />;
  if (location === "alacena") return <Package className={`${className} text-amber-600`} />;
  return <Refrigerator className={`${className} text-cyan-600`} />;
}

interface NeveraItemRowProps {
  item: PantryItem;
  onEdit: () => void;
  onQuickAdjust?: (delta: number) => void;
  /** Modo recuento: muestra − / + en línea en vez del menú. */
  recountMode?: boolean;
}

/**
 * Una fila de la nevera.
 *
 * Regla de densidad: **máximo dos datos** además del nombre y la cantidad.
 * La línea de apoyo elige el más informativo de los que existan —
 * vencimiento > déficit > último uso — en vez de concatenarlos todos, que es
 * exactamente lo que hace que SoftList se sienta cargado.
 */
export function NeveraItemRow({
  item,
  onEdit,
  onQuickAdjust,
  recountMode = false,
}: NeveraItemRowProps) {
  const status = item.status ?? "ok";
  const capsule = STOCK_CAPSULE_CLASS[status];
  const label = item.label;

  // Un solo dato de apoyo, el más informativo.
  let support: string | null = null;
  if (item.daysToExpiry !== null && item.daysToExpiry !== undefined) {
    support =
      item.daysToExpiry < 0
        ? `venció hace ${Math.abs(item.daysToExpiry)} d`
        : item.daysToExpiry === 0
          ? "vence hoy"
          : `vence en ${item.daysToExpiry} d`;
  } else if ((item.deficit ?? 0) > 0) {
    support = `falta ${formatQuantity(item.deficit!, item.unit)}`;
  } else if (item.daysSinceUse !== null && item.daysSinceUse !== undefined && item.daysSinceUse > 0) {
    support = `hace ${item.daysSinceUse} d sin usar`;
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-center gap-2.5 rounded-xl bg-white px-2.5 py-2 dark:bg-gray-800/70"
    >
      <LocationIcon location={item.location} />

      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13.5px] font-medium text-gray-900 dark:text-white">
            {item.name}
          </p>
          {capsule && label && (
            <span className={`shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-semibold ${capsule}`}>
              {label}
            </span>
          )}
        </div>
        {support && (
          <p className="mt-0.5 truncate text-[10.5px] text-gray-400">{support}</p>
        )}
      </button>

      {recountMode && onQuickAdjust ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-lg"
            onClick={() => onQuickAdjust(-1)}
            aria-label={`Quitar uno de ${item.name}`}
          >
            <Minus className="size-3.5" />
          </Button>
          <span className="w-14 text-center text-[13px] font-semibold tabular-nums text-gray-900 dark:text-white">
            {formatQuantity(item.quantity, "")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 rounded-lg"
            onClick={() => onQuickAdjust(1)}
            aria-label={`Agregar uno a ${item.name}`}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      ) : (
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-gray-900 dark:text-white">
          {formatQuantity(item.quantity, "")}
          <small className="ml-0.5 font-normal text-gray-400">{item.unit}</small>
        </span>
      )}

      {recountMode && (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-gray-400"
          onClick={onEdit}
          aria-label={`Editar ${item.name}`}
        >
          <Pencil className="size-3.5" />
        </Button>
      )}
    </motion.div>
  );
}
