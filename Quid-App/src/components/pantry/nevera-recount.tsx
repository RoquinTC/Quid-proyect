"use client";

import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Check } from "lucide-react";
import { motion } from "framer-motion";
import { NeveraItemRow } from "./nevera-item-row";
import { LOCATION_LABELS, LOCATION_ORDER, severityRank } from "./nevera-style";
import type { PantryItem } from "@/lib/types/pantry";

interface NeveraRecountProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PantryItem[];
  onQuickAdjust: (item: PantryItem, delta: number) => void;
  onEdit: (item: PantryItem) => void;
}

/**
 * **Modo inventario / Recuento** — "Actualizar nevera".
 *
 * El momento en que abres la nevera y cuentas lo que ves. Por eso:
 *  - Agrupa por **ubicación** (recorres la nevera física en orden).
 *  - Los urgentes van primero dentro de cada grupo: son los que más importa
 *    corregir, porque de ellos depende la siguiente lista.
 *  - `−` / `+` para lo que se cuenta de a uno; tocar el nombre para el resto.
 *  - Los ajustes se aplican **al instante** (optimista) y se persisten solos:
 *    contar no debe requerir un botón de guardar.
 */
export function NeveraRecount({
  open,
  onOpenChange,
  items,
  onQuickAdjust,
  onEdit,
}: NeveraRecountProps) {
  const [search, setSearch] = useState("");
  const [touched, setTouched] = useState(0);

  const grouped = useMemo(() => {
    const filtered = items.filter((it) =>
      it.name.toLowerCase().includes(search.toLowerCase())
    );
    const groups = new Map<string, PantryItem[]>();
    for (const item of filtered) {
      const key = item.location ?? "nevera";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => {
        const bySeverity = severityRank(a.status) - severityRank(b.status);
        return bySeverity !== 0 ? bySeverity : a.name.localeCompare(b.name, "es");
      });
    }
    return LOCATION_ORDER.filter((loc) => groups.has(loc)).map((loc) => ({
      location: loc,
      label: LOCATION_LABELS[loc],
      items: groups.get(loc)!,
    }));
  }, [items, search]);

  const handleAdjust = (item: PantryItem, delta: number) => {
    setTouched((n) => n + 1);
    onQuickAdjust(item, delta);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[88vh] rounded-t-2xl p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="px-4 pb-2 pt-4">
            <SheetTitle className="text-[15px]">Contando la nevera</SheetTitle>
            <SheetDescription className="text-[12px]">
              Abre la puerta y ajusta lo que veas. Se guarda solo.
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar producto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 rounded-xl bg-white pl-9 text-[13px] dark:bg-gray-800/70"
              />
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-24">
            {grouped.length === 0 ? (
              <p className="py-10 text-center text-[12.5px] text-gray-400">
                {search ? "Nada con ese nombre" : "La nevera está vacía"}
              </p>
            ) : (
              grouped.map((group) => (
                <div key={group.location}>
                  <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <NeveraItemRow
                        key={item.id}
                        item={item}
                        onEdit={() => onEdit(item)}
                        onQuickAdjust={(delta) => handleAdjust(item, delta)}
                        recountMode
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pie fijo: confirma sin que el usuario tenga que buscar cómo salir */}
          <div className="absolute inset-x-0 bottom-0 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[11.5px] text-gray-400">
                {touched > 0
                  ? `${touched} ajuste${touched === 1 ? "" : "s"} guardado${touched === 1 ? "" : "s"}`
                  : "Sin cambios todavía"}
              </p>
              <Button
                onClick={() => onOpenChange(false)}
                className="h-9 rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 px-4 text-[13px] font-semibold"
              >
                {touched > 0 ? <Check className="size-4" /> : null}
                Listo
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
