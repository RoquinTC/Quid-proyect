"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { ShoppingItemForm } from "./shopping-item-form";
import { ShoppingListRow } from "./shopping-list-row";
import { ShoppingListDetailSkeleton } from "./shopping-list-detail-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  ShoppingCart,
  CheckCircle2,
  ClipboardCheck,
  Trash2,
  Loader2,
  Wallet,
  CreditCard,
  ChevronDown,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { PaymentMethodSelector } from "@/components/transport/payment-method-selector";
import { lineTotal } from "@/lib/pantry/line-total";
import type { Account, Debt, ShoppingListItem, ShoppingList, HealthProfile } from "@/lib/types";

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

interface ShoppingListDetailProps {
  listId: string;
  onBack: () => void;
}

export function ShoppingListDetail({ listId, onBack }: ShoppingListDetailProps) {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [healthProfiles, setHealthProfiles] = useState<HealthProfile[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [paymentType, setPaymentType] = useState<"account" | "credit_card">("account");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [paymentSubAccountId, setPaymentSubAccountId] = useState("");
  const [paymentDebtId, setPaymentDebtId] = useState("");
  const [installmentCount, setInstallmentCount] = useState("1");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [confirmStoreName, setConfirmStoreName] = useState("");
  const [confirmPurpose, setConfirmPurpose] = useState("Mercado");
  const [confirmDescription, setConfirmDescription] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // "Convertir a stock": which purchased items land in the pantry, the stepper
  // quantity per item, and whether to seed the pantry minStock ("Recordar mínimos").
  const [stockSelection, setStockSelection] = useState<Record<string, number>>({});
  const [stockEditing, setStockEditing] = useState<Record<string, boolean>>({});
  const [minMode, setMinMode] = useState(true);
  // Descuento TOTAL de esta confirmación: el que da la tienda por la compra
  // completa (monto fijo o porcentaje), no por producto.
  const [totalDiscountType, setTotalDiscountType] = useState<"FIXED" | "PERCENT">("FIXED");
  const [totalDiscountValue, setTotalDiscountValue] = useState("");

  /**
   * Recarga la lista.
   *
   * `silent` es la clave para que la pantalla NO parpadee: en modo silencioso
   * no toca `loading`, así que no se reemplaza la vista por el skeleton. Solo
   * la primera carga (y un cambio de lista) muestran el skeleton.
   */
  const fetchList = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ShoppingList>(`/api/shopping-lists/${listId}`);
      setList(data);
    } catch (error) {
      console.error("Error fetching list:", error);
      if (!silent) {
        setError(error instanceof Error ? error.message : "No pudimos cargar la lista.");
        setList(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [listId]);

  const fetchProfiles = useCallback(async () => {
    try {
      const data = await apiFetch<HealthProfile[]>("/api/health-profiles");
      setHealthProfiles(data);
    } catch (error) {
      console.error("Error fetching profiles:", error);
    }
  }, []);

  /**
   * Opciones de pago. Se ejecuta UNA vez: los defaults se resuelven con
   * `setState` funcional para no depender de `paymentAccountId`/`paymentDebtId`.
   *
   * Antes dependía de ambos, y como el efecto de montaje la tenía en sus
   * dependencias, elegir una cuenta o una tarjeta volvía a disparar el efecto
   * completo —incluido `fetchList()` con skeleton— y la pantalla parpadeaba.
   */
  const fetchFinanceOptions = useCallback(async () => {
    try {
      const [accountsData, debtsData] = await Promise.all([
        apiFetch<Account[]>("/api/accounts"),
        apiFetch<Debt[]>("/api/debts"),
      ]);
      setAccounts(accountsData);
      setDebts(debtsData.filter((debt) => debt.type !== "loan"));
      setPaymentAccountId((prev) => prev || (accountsData[0]?.id ?? ""));
      setPaymentDebtId((prev) => {
        if (prev) return prev;
        const firstCreditCard = debtsData.find((debt) => debt.type !== "loan");
        return firstCreditCard?.id ?? "";
      });
    } catch (error) {
      console.error("Error fetching finance options:", error);
    }
  }, []);

  // Efectos separados a propósito: así un cambio de pago no recarga la lista.
  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);
  useEffect(() => { fetchFinanceOptions(); }, [fetchFinanceOptions]);

  /**
   * Actualización optimista de una línea.
   *
   * El estado local se toca PRIMERO para que la fila responda al instante; la
   * petición va detrás y solo si falla se revierte. Después se reconcilia en
   * silencio. Así marcar algo se siente como mover la fila, no como recargar.
   */
  const patchItemOptimistically = useCallback(
    async (
      itemId: string,
      patch: Partial<Pick<ShoppingListItem, "isPurchased" | "checked" | "actualPrice" | "addedToCart">>
    ) => {
      setList((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item
              ),
            }
          : prev
      );
      try {
        await apiFetch(`/api/shopping-lists/${listId}/items/${itemId}`, {
          method: "PUT",
          body: JSON.stringify(patch),
        });
        fetchList(true);
      } catch (error) {
        console.error("Error updating item:", error);
        fetchList(true); // revierte al estado del servidor
      }
    },
    [listId, fetchList]
  );

  const handleToggleChecked = (itemId: string, checked: boolean) =>
    patchItemOptimistically(itemId, { checked });

  const handleTogglePurchased = (itemId: string, isPurchased: boolean) =>
    patchItemOptimistically(itemId, { isPurchased });

  /** Marca/desmarca "va al carrito". El carrito es su propio total. */
  const handleToggleCart = (itemId: string, addedToCart: boolean) =>
    patchItemOptimistically(itemId, { addedToCart });

  const handleUpdateActualPrice = (itemId: string, actualPrice: number) =>
    patchItemOptimistically(itemId, { actualPrice });

  const handleDeleteItem = async (itemId: string) => {
    try {
      await apiFetch(`/api/shopping-lists/${listId}/items/${itemId}`, {
        method: "DELETE",
      });
      await fetchList();
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      await apiFetch(`/api/shopping-lists/${listId}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchList();
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Open the market-purchase confirm dialog. Seeds "Convertir a stock" with
  // Todo selected (every purchased item, each at its bought quantity) and the
  // "Recordar mínimos" toggle on — the normal case is one tap to confirm.
  const openConfirmDialog = () => {
    setConfirmError(null);
    setConfirmStoreName(list?.storeName || "");
    setConfirmPurpose(list?.purpose || list?.name || "Mercado");
    setPurchaseDate(
      list?.purchaseDate
        ? list.purchaseDate.slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    );
    setConfirmDescription("");
    const sel: Record<string, number> = {};
    (list?.items || [])
      // Se confirma lo que está EN EL CARRITO: ese es el total que ves.
      .filter((i) => i.addedToCart || i.isPurchased)
      // Solo lo que falta: si ya confirmaste 3 de 5, esta compra propone 2.
      // Antes proponía la cantidad completa y el servidor la recortaba en
      // silencio, que es confuso al revisar el ticket.
      .forEach((i) => {
        const remaining = Math.max(0, i.quantity - (i.confirmedQuantity ?? 0));
        if (remaining > 1e-9) sel[i.id] = remaining;
      });
    setStockSelection(sel);
    setStockEditing({});
    setMinMode(true);
    setConfirmDialogOpen(true);
  };

  const handleConfirm = async () => {
    setConfirmError(null);
    if (paymentType === "account" && !paymentAccountId) {
      setConfirmError("Selecciona la cuenta con la que pagaste.");
      return;
    }
    if (paymentType === "credit_card" && !paymentDebtId) {
      setConfirmError("Selecciona la tarjeta de crédito.");
      return;
    }

    setConfirming(true);
    try {
      await apiFetch(`/api/shopping-lists/${listId}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          paymentType,
          accountId: paymentAccountId || null,
          subAccountId: paymentSubAccountId || null,
          debtId: paymentType === "credit_card" ? paymentDebtId : null,
          installmentCount: paymentType === "credit_card" ? Number(installmentCount) || 1 : null,
          purchaseDate: purchaseDate ? `${purchaseDate}T12:00:00.000Z` : null,
          storeName: confirmStoreName || null,
          purpose: confirmPurpose || null,
          description: confirmDescription || null,
          items: Object.entries(stockSelection).map(([id, quantity]) => ({
            id,
            quantity,
          })),
          minMode,
          totalDiscountType: totalDiscountValue ? totalDiscountType : null,
          totalDiscountValue: totalDiscountValue ? parseFloat(totalDiscountValue) : null,
        }),
      });
      setConfirmDialogOpen(false);
      // Silencioso: el diálogo ya se cerró y la lista se reconcilia en su
      // sitio. Antes esto ponía `loading`, la pantalla se iba a skeleton y
      // volvía — el parpadeo al confirmar.
      fetchList(true);
      toast.success("Compra registrada");
    } catch (error) {
      console.error("Error confirming list:", error);
      setConfirmError(error instanceof Error ? error.message : "No se pudo confirmar la compra.");
    } finally {
      setConfirming(false);
    }
  };

  const handleProfileChange = async (profileId: string) => {
    try {
      await apiFetch(`/api/shopping-lists/${listId}`, {
        method: "PUT",
        body: JSON.stringify({ profileId: profileId === "none" ? null : profileId }),
      });
      await fetchList();
    } catch (error) {
      console.error("Error updating profile:", error);
    }
  };

  if (loading || !list) {
    return (
      <ShoppingListDetailSkeleton
        loading={loading}
        errorMessage={error ?? undefined}
        onRetry={fetchList}
        onBack={onBack}
      />
    );
  }

  const buildSuggestedDescription = () => {
    const store = confirmStoreName.trim();
    const purpose = confirmPurpose.trim() || list.purpose || list.name || "Mercado";
    if (store && purpose.toLowerCase() !== "mercado") return `Compra ${store} - ${purpose}`;
    if (store) return `Mercado - ${store}`;
    return `Mercado - ${purpose}`;
  };

  const handleDeleteList = async () => {
    if (!list) return;
    const ok = window.confirm(`¿Eliminar la lista "${list.name}"?`);
    if (!ok) return;
    try {
      await apiFetch(`/api/shopping-lists/${listId}`, { method: "DELETE" });
      onBack();
    } catch (error) {
      console.error("Error deleting list:", error);
    }
  };

  const totalEstimated = list.items.reduce(
    (sum, i) =>
      sum +
      lineTotal({
        quantity: i.quantity,
        price: i.estimatedPrice,
        unit: i.unit,
        priceUnitId: i.priceUnitId,
        multiplyQuantity: i.multiplyQuantity,
      }),
    0
  );
  const totalActual = list.items.reduce(
    (sum, i) =>
      sum +
      lineTotal({
        quantity: i.quantity,
        price: i.actualPrice ?? i.estimatedPrice,
        unit: i.unit,
        priceUnitId: i.priceUnitId,
        multiplyQuantity: i.multiplyQuantity,
      }),
    0
  );
  const cartCount = list.items.filter((i) => i.addedToCart).length;
  // Lo que de verdad se va a confirmar: la selección, no el flag `isPurchased`.
  // Contar `isPurchased` era el bug de producción: el resumen decía "0 ítems"
  // mientras el importe salía correcto, porque el dinero venía del carrito.
  const selectedCount = Object.keys(stockSelection).length;
  const selectedAccount = accounts.find((account) => account.id === paymentAccountId);
  const availableSubAccounts = selectedAccount?.subAccounts || [];

  /**
   * ¿La lista está en fase de compra?
   *
   * `partially_confirmed` cuenta como fase de compra: es una lista a la que le
   * falta parte del mercado y debe poder seguir marcándose en otra tienda. Antes
   * se quedaba sin checkbox ni botón de confirmar, así que la compra parcial
   * dejaba la lista inservible.
   */
  const isShoppingPhase =
    list.status === "shopping" || list.status === "partially_confirmed";

  const statusLabel: Record<string, string> = {
    draft: "Borrador",
    shopping: "Comprando",
    partially_confirmed: "Compra parcial",
    verified: "Verificando",
    completed: "Completada",
  };

  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
    shopping: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    partially_confirmed: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    verified: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };

  return (
    <div className="p-4 space-y-4 pb-safe">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="size-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <ArrowLeft className="size-4 text-gray-600 dark:text-gray-400" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{list.name}</h2>
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${statusColor[list.status]}`}>
              {statusLabel[list.status]}
            </Badge>
            <span className="text-xs text-gray-400">
              {list.items.length} productos · {cartCount} en el carrito
            </span>
          </div>
          {(list.storeName || list.purpose || list.purchaseDate) && (
            <p className="text-xs text-gray-400 mt-0.5">
              {[list.storeName, list.purpose, list.purchaseDate ? `Compra: ${list.purchaseDate.slice(0, 10)}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <button
          onClick={handleDeleteList}
          className="size-9 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 flex items-center justify-center"
          aria-label="Eliminar lista"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {/* Profile selector */}
      {list.status !== "completed" && (
        <div className="space-y-1">
          <span className="text-xs text-gray-500">Perfil de salud</span>
          <Select
            value={list.profileId || "none"}
            onValueChange={handleProfileChange}
          >
            <SelectTrigger className="rounded-xl h-9">
              <SelectValue placeholder="Sin perfil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin perfil</SelectItem>
              {healthProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.type === "owner" ? "Propietario" : "Invitado"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Progress bar for shopping phase — inline, not a card: el progreso no
          merece 60px de alto cuando lo que importa es la lista. */}
      {isShoppingPhase && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
              initial={{ width: 0 }}
              animate={{
                width: `${list.items.length > 0 ? (cartCount / list.items.length) * 100 : 0}%`,
              }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-gray-500">
            {cartCount}/{list.items.length}
          </span>
        </div>
      )}

      {/* Items list — UNA sola tarjeta con filas compactas.
          Antes cada producto era una Card con sombra y padding propio: ~90px por
          fila, así que en un monitor solo entraban tres. Ahora la fila mide ~46px
          y el contenedor aporta la única elevación. */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
        {[...list.items]
          // Lo marcado baja: primero lo pendiente, y `sortOrder` mantiene el
          // orden manual dentro de cada grupo. El sort es estable, así que no
          // bailan entre sí cuando cambian de grupo.
          .sort((a, b) => {
            const aDone = isShoppingPhase ? a.isPurchased : a.checked;
            const bDone = isShoppingPhase ? b.isPurchased : b.checked;
            if (aDone !== bDone) return aDone ? 1 : -1;
            return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
          })
          .map((item) => (
          <motion.div
            layout
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            key={item.id}
            className="flex items-center gap-2.5 border-b border-gray-50 px-3 py-2 last:border-0 dark:border-gray-700/50"
          >
            {isShoppingPhase && (
              <Checkbox
                checked={!!item.addedToCart}
                onCheckedChange={(checked) =>
                  handleToggleCart(item.id, checked as boolean)
                }
                className="size-4 shrink-0"
              />
            )}
            {list.status === "verified" && (
              <Checkbox
                checked={item.checked}
                onCheckedChange={(checked) =>
                  handleToggleChecked(item.id, checked as boolean)
                }
                className="size-4 shrink-0"
              />
            )}
            {list.status === "completed" && (
              <CheckCircle2 className="size-4 shrink-0 text-green-500" />
            )}

            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-[13px] font-medium leading-tight ${
                  item.isPurchased && list.status !== "draft"
                    ? "text-gray-400 line-through dark:text-gray-500"
                    : "text-gray-900 dark:text-white"
                }`}
              >
                {item.name}
              </p>
              <p className="text-[10.5px] leading-tight text-gray-400">
                {item.quantity} {unitLabels[item.unit] || item.unit}
              </p>
            </div>

            {/* Precio: en modo verificación se edita en línea; si no, se lee. */}
            {list.status === "verified" ? (
              <div className="flex shrink-0 items-center gap-0.5">
                <span className="text-[11px] text-gray-400">$</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={item.actualPrice ?? ""}
                  onChange={(e) =>
                    handleUpdateActualPrice(item.id, parseFloat(e.target.value) || 0)
                  }
                  className="h-6 w-16 rounded-md px-1 text-right text-[12px]"
                />
              </div>
            ) : (
              <span className="shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-gray-900 dark:text-white">
                {item.actualPrice && list.status === "completed"
                  ? formatCurrency(
                      lineTotal({
                        quantity: item.quantity,
                        price: item.actualPrice,
                        unit: item.unit,
                        priceUnitId: item.priceUnitId,
                        multiplyQuantity: item.multiplyQuantity,
                      })
                    )
                  : item.estimatedPrice
                    ? `~${formatCurrency(
                        lineTotal({
                          quantity: item.quantity,
                          price: item.estimatedPrice,
                          unit: item.unit,
                          priceUnitId: item.priceUnitId,
                          multiplyQuantity: item.multiplyQuantity,
                        })
                      )}`
                    : ""}
              </span>
            )}

            {/* Se puede quitar una línea mientras la lista siga abierta. Antes
                solo aparecía en borrador, así que estando "Comprando" no había
                forma de eliminar un producto de la lista. */}
            {list.status !== "completed" && (
              <button
                onClick={() => handleDeleteItem(item.id)}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                aria-label={`Eliminar ${item.name}`}
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </motion.div>
        ))}
      </div>

      {/* Empty items */}
      {list.items.length === 0 && (
        <div className="text-center py-8">
          <ShoppingCart className="size-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No hay items en esta lista</p>
        </div>
      )}

      {/* Totales — dos cifras en una sola línea, como el papelito:
          lo que vale la lista y lo que llevas en el carrito. */}
      {list.items.length > 0 && (
        <div className="flex items-stretch justify-between rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-900/10">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700/70 dark:text-amber-400/70">
              Lista
            </p>
            <p className="truncate text-[14px] font-bold tabular-nums text-gray-900 dark:text-white">
              {formatCurrency(
                list.status === "verified" || list.status === "completed"
                  ? totalActual
                  : totalEstimated
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700/70 dark:text-amber-400/70">
              Carrito
            </p>
            <p className="truncate text-[14px] font-bold tabular-nums text-gray-900 dark:text-white">
              {formatCurrency(
                list.items
                  .filter((i) => i.addedToCart)
                  .reduce(
                    (sum, i) =>
                      sum +
                      lineTotal({
                        quantity: i.quantity,
                        price: i.actualPrice ?? i.estimatedPrice,
                        unit: i.unit,
                        priceUnitId: i.priceUnitId,
                        multiplyQuantity: i.multiplyQuantity,
                      }),
                    0
                  )
              )}
            </p>
          </div>
        </div>
      )}

      {/* Action buttons based on status */}
      <div className="space-y-2">
        {list.status === "draft" && (
          <>
            <Button
              onClick={() => setShowItemForm(true)}
              className="w-full rounded-xl border border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
              variant="outline"
            >
              <Plus className="size-4 mr-2" />
              Agregar Item
            </Button>
            {list.items.length > 0 && (
              <Button
                onClick={() => handleStatusChange("shopping")}
                disabled={updatingStatus}
                className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-500"
              >
                {updatingStatus ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <ShoppingCart className="size-4 mr-2" />
                )}
                Ir a Comprar
              </Button>
            )}
          </>
        )}

        {isShoppingPhase && (
          <>
            <Button
              onClick={() => setShowItemForm(true)}
              className="w-full rounded-xl border border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
              variant="outline"
            >
              <Plus className="size-4 mr-2" />
              Agregar antojo o producto
            </Button>
            <Button
              onClick={openConfirmDialog}
              disabled={confirming}
              className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-500"
            >
              <CheckCircle2 className="size-4 mr-2" />
              Confirmar y Actualizar Despensa
            </Button>
          </>
        )}

        {list.status === "verified" && (
          <Button
            onClick={openConfirmDialog}
            disabled={confirming}
            className="w-full rounded-xl bg-gradient-to-r from-green-600 to-emerald-500"
          >
            {confirming ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="size-4 mr-2" />
            )}
            Confirmar y Actualizar Despensa
          </Button>
        )}
      </div>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirmar compra de mercado</DialogTitle>
            <DialogDescription>
              Registra el gasto en Finanzas y actualiza la despensa con los productos comprados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-300">Total real</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalActual)}</p>
              <p className="text-xs text-gray-500 mt-1">Categoría: Alimentación / Mercado</p>
            </div>

            {/* Resumen (lectura) — revisión fina sin re-crear el paso "Verificar" */}
            <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-2 text-left dark:border-gray-700 dark:bg-gray-800"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    🛒 Listo para confirmar
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                      {selectedCount} ítems
                    </span>
                    <ChevronDown
                      className={`size-4 text-gray-400 transition-transform ${summaryOpen ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1.5 overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
                  {list.items
                    .filter((i) => stockSelection[i.id] !== undefined)
                    .map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between border-b border-gray-50 px-3 py-1.5 text-xs last:border-0 dark:border-gray-800"
                      >
                        <span className="truncate pr-2 text-gray-700 dark:text-gray-300">
                          {it.quantity}× {it.name}
                        </span>
                        <span className="shrink-0 text-gray-400">
                          {unitLabels[it.unit] || it.unit}
                        </span>
                      </div>
                    ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Convertir a stock: what lands in the pantry + min stock seeding */}
            {selectedCount > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Convertir a stock
                  </span>
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    <Switch
                      checked={minMode}
                      onCheckedChange={setMinMode}
                      aria-label="Recordar mínimos"
                    />
                    Recordar mínimos
                  </label>
                </div>
                <ul className="overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
                  {list.items
                    .filter((i) => stockSelection[i.id] !== undefined)
                    .map((item) => (
                      <ShoppingListRow
                        key={item.id}
                        item={item}
                        selected={stockSelection[item.id] !== undefined}
                        minMode={minMode}
                        editing={!!stockEditing[item.id]}
                        quantity={stockSelection[item.id] ?? item.quantity}
                        onToggle={() =>
                          setStockSelection((prev) => {
                            const next = { ...prev };
                            if (next[item.id] !== undefined) delete next[item.id];
                            else next[item.id] = item.quantity;
                            return next;
                          })
                        }
                        onChangeQuantity={(q) =>
                          setStockSelection((prev) => {
                            const next = { ...prev };
                            if (next[item.id] === undefined) {
                              next[item.id] = item.quantity;
                            }
                            next[item.id] = q;
                            setStockEditing((e) => ({ ...e, [item.id]: true }));
                            return next;
                          })
                        }
                      />
                    ))}
                </ul>
                <p className="px-1 text-[11px] text-gray-400">
                  Desmarca lo que NO quieras mover a la despensa. El mínimo respeta el existente
                  (solo sube, nunca baja).
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="confirm-store">Tienda</Label>
                <Input
                  id="confirm-store"
                  placeholder="Ej: D1, Éxito"
                  value={confirmStoreName}
                  onChange={(e) => setConfirmStoreName(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-date">Fecha real</Label>
                <Input
                  id="confirm-date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-purpose">Nombre o motivo</Label>
              <Input
                id="confirm-purpose"
                placeholder="Mercado, postre, cumpleaños..."
                value={confirmPurpose}
                onChange={(e) => setConfirmPurpose(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-description">Nombre en Finanzas</Label>
              <Input
                id="confirm-description"
                placeholder={buildSuggestedDescription()}
                value={confirmDescription}
                onChange={(e) => setConfirmDescription(e.target.value)}
                className="rounded-xl"
              />
              <p className="text-xs text-gray-400">
                Si lo dejas vacío se guardará como: {buildSuggestedDescription()}
              </p>
            </div>

            {/* Mismo selector de pago que Transporte: maneja bolsillos dentro de
                la cuenta y, al pagar con TC, desde qué cuenta se debita. */}
            <PaymentMethodSelector
              defaultPaymentType={paymentType}
              defaultAccountId={paymentAccountId || null}
              defaultSubAccountId={paymentSubAccountId || null}
              defaultDebtId={paymentDebtId || null}
              defaultInstallmentCount={Number(installmentCount) || 1}
              creditCardAccountHint="Al pagar la tarjeta, se debitará de"
              onChange={(payment) => {
                setPaymentType(payment.paymentType);
                setPaymentAccountId(payment.accountId ?? "");
                setPaymentSubAccountId(payment.subAccountId ?? "");
                setPaymentDebtId(payment.debtId ?? "");
                setInstallmentCount(
                  payment.installmentCount ? String(payment.installmentCount) : "1"
                );
                setConfirmError(null);
              }}
            />

            {/* Descuento TOTAL de la compra (por tienda): el que aplican por el
                total, no por producto. Fijo o porcentual. */}
            <div className="space-y-1.5 rounded-xl bg-amber-50/60 p-3 dark:bg-amber-900/10">
              <Label className="text-[12.5px]">Descuento total de esta compra</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  placeholder="0"
                  value={totalDiscountValue}
                  onChange={(e) => setTotalDiscountValue(e.target.value)}
                  className="h-9 rounded-lg text-right"
                />
                <Select
                  value={totalDiscountType}
                  onValueChange={(v) => setTotalDiscountType(v as "FIXED" | "PERCENT")}
                >
                  <SelectTrigger className="h-9 w-[110px] rounded-lg text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Monto $</SelectItem>
                    <SelectItem value="PERCENT">Porcentaje %</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10.5px] leading-tight text-gray-500">
                Si te descontaron por el total de la compra, ponlo aquí. Cada tienda
                lleva su propio descuento.
              </p>
            </div>

            {confirmError && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-300">
                {confirmError}
              </p>
            )}

            <Button
              onClick={handleConfirm}
              disabled={confirming}
              className="w-full rounded-xl bg-gradient-to-r from-green-600 to-emerald-500"
            >
              {confirming ? <Loader2 className="size-4 animate-spin mr-2" /> : <CheckCircle2 className="size-4 mr-2" />}
              Registrar compra
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Item Form */}
      <ShoppingItemForm
        open={showItemForm}
        onOpenChange={setShowItemForm}
        listId={listId}
        onSuccess={fetchList}
      />
    </div>
  );
}
