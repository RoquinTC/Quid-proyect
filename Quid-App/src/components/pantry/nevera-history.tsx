"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { useDataEvent } from "@/hooks/use-data-event";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Receipt,
  Store,
  CalendarDays,
  RotateCcw,
  Trash2,
  Loader2,
  CreditCard,
  Landmark,
  ChevronRight,
  Undo2,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { lineTotal } from "@/lib/pantry/line-total";
import { NeveraReports } from "./nevera-reports";

interface Confirmation {
  id: string;
  shoppingListId: string;
  listName: string;
  listStatus: string | null;
  storeName: string | null;
  purchaseDate: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  discountType: string | null;
  discountValue: number | null;
  paymentType: string;
  itemCount: number;
  reversedAt: string | null;
  canReverse: boolean;
}

interface TicketLine {
  id: string;
  itemId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number | null;
  sourceItemId: string | null;
  reversedAt: string | null;
}

interface Ticket extends Confirmation {
  lines: TicketLine[];
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * **Historial** — tab propio.
 *
 * El histórico está individualizado **por confirmación**, no por lista: una
 * compra repartida entre dos tiendas son dos filas, cada una con su fecha, su
 * tienda y su valor. Es lo que permite reversar solo la que se registró mal.
 *
 * Compacto por diseño: una fila de ~56 px con lo esencial, y el detalle completo
 * dentro de una hoja, como un tiquete.
 */
export function NeveraHistory() {
  const [confirmations, setConfirmations] = useState<Confirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Compras (registros) o Reportes (vista derivada).
  const [segment, setSegment] = useState<"compras" | "reportes">("compras");

  // Diálogos de eliminación
  const [deleteTarget, setDeleteTarget] = useState<Ticket | null>(null);
  const [reverseTarget, setReverseTarget] = useState<Ticket | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await apiFetch<{ confirmations: Confirmation[] }>("/api/pantry/history");
      setConfirmations(data.confirmations ?? []);
    } catch (e) {
      console.error("Error fetching history:", e);
      setConfirmations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);
  useDataEvent("shoppingLists", fetchHistory);
  useDataEvent("pantryItems", fetchHistory);

  const openTicket = async (id: string) => {
    setTicketOpen(true);
    setTicket(null);
    try {
      const data = await apiFetch<Ticket>(`/api/pantry/history/${id}`);
      setTicket(data);
    } catch {
      toast.error("No se pudo abrir el tiquete");
      setTicketOpen(false);
    }
  };

  const doReverse = async () => {
    if (!reverseTarget) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ message: string; warning?: string }>(
        `/api/pantry/history/${reverseTarget.id}/reverse`,
        { method: "POST" }
      );
      toast.success(res.message);
      if (res.warning) toast.warning(res.warning);
      setReverseTarget(null);
      setTicketOpen(false);
      fetchHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reversar");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (mode: "history" | "full") => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ message: string; warning?: string }>(
        `/api/pantry/history/${deleteTarget.id}?mode=${mode}`,
        { method: "DELETE" }
      );
      toast.success(res.message);
      if (res.warning) toast.warning(res.warning);
      setDeleteTarget(null);
      setTicketOpen(false);
      fetchHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  if (confirmations.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm dark:bg-gray-800/70">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-500 shadow-lg">
            <Receipt className="size-6 text-white" />
          </div>
          <h3 className="mb-1 font-bold text-gray-900 dark:text-white">Sin compras todavía</h3>
          <p className="text-[12.5px] text-gray-500">
            Cuando confirmes una compra del mercado, aparecerá aquí con su tiquete.
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto w-full max-w-3xl space-y-2 p-4 pb-safe">
      {/* Segmento: las compras y los reportes viven aquí porque la navegación
          del módulo son 5 pestañas fijas; un reporte es vista derivada, no un
          módulo nuevo (así lo define la especificación §10). */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        {(["compras", "reportes"] as const).map((seg) => (
          <button
            key={seg}
            onClick={() => setSegment(seg)}
            className={`flex-1 rounded-lg py-1.5 text-[12px] font-medium capitalize transition-colors ${
              segment === seg
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                : "text-gray-500"
            }`}
          >
            {seg === "compras" ? "Compras" : "Reportes"}
          </button>
        ))}
      </div>

      {segment === "reportes" ? (
        <NeveraReports />
      ) : (
        <>
          <p className="px-1 text-[11px] text-gray-400">
            Cada compra es su propio registro: una lista comprada en dos tiendas aparece dos veces.
          </p>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
        {confirmations.map((c) => (
          <button
            key={c.id}
            onClick={() => openTicket(c.id)}
            className="flex w-full items-center gap-2.5 border-b border-gray-50 px-3 py-2.5 text-left last:border-0 hover:bg-gray-50/70 dark:border-gray-700/50 dark:hover:bg-gray-700/30"
          >
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                c.reversedAt
                  ? "bg-gray-100 text-gray-400 dark:bg-gray-700"
                  : c.paymentType === "credit_card"
                    ? "bg-violet-50 text-violet-500 dark:bg-violet-950/40"
                    : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40"
              }`}
            >
              {c.reversedAt ? (
                <Undo2 className="size-4" />
              ) : c.paymentType === "credit_card" ? (
                <CreditCard className="size-4" />
              ) : (
                <Landmark className="size-4" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-[13px] font-medium ${
                  c.reversedAt
                    ? "text-gray-400 line-through dark:text-gray-500"
                    : "text-gray-900 dark:text-white"
                }`}
              >
                {c.listName}
              </p>
              <p className="flex items-center gap-1 truncate text-[10.5px] text-gray-400">
                <Store className="size-2.5" />
                {c.storeName || "Sin tienda"}
                <span className="mx-0.5">·</span>
                <CalendarDays className="size-2.5" />
                {formatDate(c.purchaseDate)}
                {c.reversedAt && <span className="ml-1 text-amber-600">· reversada</span>}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p
                className={`text-[13px] font-bold tabular-nums ${
                  c.reversedAt ? "text-gray-400" : "text-gray-900 dark:text-white"
                }`}
              >
                {formatCurrency(c.total)}
              </p>
              <p className="text-[10px] text-gray-400">{c.itemCount} prod.</p>
            </div>

            <ChevronRight className="size-3.5 shrink-0 text-gray-300" />
          </button>
        ))}
      </div>

      {/* ── Tiquete ── */}
      <Sheet open={ticketOpen} onOpenChange={setTicketOpen}>
        <SheetContent side="bottom" className="max-h-[88vh] rounded-t-2xl p-0">
          <div className="flex max-h-[88vh] flex-col">
            <SheetHeader className="px-4 pb-2 pt-4">
              <SheetTitle className="flex items-center gap-2 text-[15px]">
                <Receipt className="size-4 text-cyan-600" />
                {ticket?.listName ?? "Tiquete"}
              </SheetTitle>
              <SheetDescription className="text-[11.5px]">
                {ticket?.storeName || "Sin tienda"} ·{" "}
                {ticket ? formatDate(ticket.purchaseDate) : ""}
                {ticket?.reversedAt ? " · reversada" : ""}
              </SheetDescription>
            </SheetHeader>

            {!ticket ? (
              <div className="py-10 text-center">
                <Loader2 className="mx-auto size-5 animate-spin text-gray-300" />
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-4">
                  <ul className="overflow-hidden rounded-xl border border-gray-100 dark:border-gray-700">
                    {ticket.lines.map((line) => {
                      const amount = lineTotal({
                        quantity: line.quantity,
                        price: line.unitPrice,
                        unit: line.unit,
                      });
                      return (
                        <li
                          key={line.id}
                          className="flex items-center gap-2 border-b border-gray-50 px-3 py-1.5 last:border-0 dark:border-gray-700/50"
                        >
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-gray-700 dark:text-gray-300">
                            {line.name}
                          </span>
                          <span className="shrink-0 text-[10.5px] text-gray-400">
                            {line.quantity} {line.unit}
                          </span>
                          <span className="w-20 shrink-0 text-right text-[12px] font-semibold tabular-nums text-gray-900 dark:text-white">
                            {amount > 0 ? formatCurrency(amount) : "—"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-2 space-y-1 rounded-xl bg-gray-50 px-3 py-2 text-[12px] dark:bg-gray-800/60">
                    <div className="flex justify-between text-gray-500">
                      <span>Subtotal</span>
                      <span className="tabular-nums">{formatCurrency(ticket.subtotal)}</span>
                    </div>
                    {ticket.discountAmount > 0 && (
                      <div className="flex justify-between text-amber-600">
                        <span>
                          Descuento
                          {ticket.discountType === "PERCENT" && ticket.discountValue
                            ? ` (${Math.round(ticket.discountValue * 100)}%)`
                            : " tienda"}
                        </span>
                        <span className="tabular-nums">
                          −{formatCurrency(ticket.discountAmount)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-200 pt-1 font-bold text-gray-900 dark:border-gray-700 dark:text-white">
                      <span>Total</span>
                      <span className="tabular-nums">{formatCurrency(ticket.total)}</span>
                    </div>
                  </div>

                  <p className="mt-2 px-1 text-[10.5px] text-gray-400">
                    {ticket.paymentType === "credit_card"
                      ? "Pagado con tarjeta de crédito"
                      : "Pagado desde una cuenta"}
                  </p>
                </div>

                <div className="space-y-1.5 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                  <Button
                    onClick={() => setReverseTarget(ticket)}
                    disabled={!ticket.canReverse || busy}
                    variant="outline"
                    className="h-10 w-full rounded-xl text-[13px] font-semibold"
                  >
                    <RotateCcw className="size-4" />
                    {ticket.canReverse ? "Reversar compra" : "Ya reversada"}
                  </Button>
                  <Button
                    onClick={() => setDeleteTarget(ticket)}
                    disabled={busy}
                    variant="ghost"
                    className="h-9 w-full rounded-xl text-[12.5px] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="size-3.5" />
                    Eliminar
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Reversar: no borra, reabre la lista ── */}
      <AlertDialog open={!!reverseTarget} onOpenChange={(o) => !o && setReverseTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">¿Reversar esta compra?</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px]">
              Se devolverá el dinero a tu cuenta o tarjeta, se descontarán los productos
              del inventario y la lista volverá a quedar abierta para editarla.{" "}
              <strong>No se borra nada.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doReverse();
              }}
              disabled={busy}
              className="rounded-xl bg-amber-600 hover:bg-amber-700"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Reversar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Eliminar: dos alcances ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Eliminar esta compra</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-[12.5px]">
              <span className="block">
                <strong>Solo quitarla del historial:</strong> no toca tus cuentas ni la
                nevera. El gasto y los productos siguen vigentes.
              </span>
              <span className="block">
                <strong>Reversar y eliminar todo:</strong> devuelve el dinero, descuenta los
                productos del inventario y borra la lista completa.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogCancel className="mt-0 rounded-xl">Cancelar</AlertDialogCancel>
            <Button
              onClick={() => doDelete("history")}
              disabled={busy}
              variant="outline"
              className="h-9 rounded-xl text-[12.5px]"
            >
              Solo quitar del historial
            </Button>
            <Button
              onClick={() => doDelete("full")}
              disabled={busy}
              className="h-9 rounded-xl bg-red-600 text-[12.5px] hover:bg-red-700"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Reversar y eliminar todo"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}
    </motion.div>
  );
}
