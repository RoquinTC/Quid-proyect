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
import { PaymentMethodSelector } from "@/components/transport/payment-method-selector";
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

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ShoppingList>(`/api/shopping-lists/${listId}`);
      setList(data);
    } catch (error) {
      console.error("Error fetching list:", error);
      setError(error instanceof Error ? error.message : "No pudimos cargar la lista.");
      setList(null);
    } finally {
      setLoading(false);
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

  const fetchFinanceOptions = useCallback(async () => {
    try {
      const [accountsData, debtsData] = await Promise.all([
        apiFetch<Account[]>("/api/accounts"),
        apiFetch<Debt[]>("/api/debts"),
      ]);
      setAccounts(accountsData);
      setDebts(debtsData.filter((debt) => debt.type !== "loan"));
      if (!paymentAccountId && accountsData.length > 0) setPaymentAccountId(accountsData[0].id);
      if (!paymentDebtId) {
        const firstCreditCard = debtsData.find((debt) => debt.type !== "loan");
        if (firstCreditCard) setPaymentDebtId(firstCreditCard.id);
      }
    } catch (error) {
      console.error("Error fetching finance options:", error);
    }
  }, [paymentAccountId, paymentDebtId]);

  useEffect(() => {
    fetchList();
    fetchProfiles();
    fetchFinanceOptions();
  }, [fetchList, fetchProfiles, fetchFinanceOptions]);

  const handleToggleChecked = async (itemId: string, checked: boolean) => {
    try {
      await apiFetch(`/api/shopping-lists/${listId}/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ checked }),
      });
      await fetchList();
    } catch (error) {
      console.error("Error toggling item:", error);
    }
  };

  const handleTogglePurchased = async (itemId: string, isPurchased: boolean) => {
    try {
      await apiFetch(`/api/shopping-lists/${listId}/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ isPurchased }),
      });
      await fetchList();
    } catch (error) {
      console.error("Error toggling purchased:", error);
    }
  };

  const handleUpdateActualPrice = async (itemId: string, actualPrice: number) => {
    try {
      await apiFetch(`/api/shopping-lists/${listId}/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({ actualPrice }),
      });
      await fetchList();
    } catch (error) {
      console.error("Error updating price:", error);
    }
  };

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
      .filter((i) => i.isPurchased)
      .forEach((i) => { sel[i.id] = i.quantity; });
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
          accountId: paymentType === "account" ? paymentAccountId : null,
          subAccountId: paymentType === "account" ? paymentSubAccountId || null : null,
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
        }),
      });
      setConfirmDialogOpen(false);
      await fetchList();
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
    (sum, i) => sum + (i.estimatedPrice || 0) * i.quantity,
    0
  );
  const totalActual = list.items.reduce(
    (sum, i) => sum + ((i.actualPrice ?? i.estimatedPrice) ?? 0) * i.quantity,
    0
  );
  const purchasedCount = list.items.filter((i) => i.isPurchased).length;
  const selectedAccount = accounts.find((account) => account.id === paymentAccountId);
  const availableSubAccounts = selectedAccount?.subAccounts || [];

  const statusLabel: Record<string, string> = {
    draft: "Borrador",
    shopping: "Comprando",
    verified: "Verificando",
    completed: "Completada",
  };

  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
    shopping: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
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
              {list.items.length} items · {purchasedCount} comprados
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

      {/* Progress bar for shopping phase */}
      {list.status === "shopping" && (
        <Card className="border-0 shadow-sm rounded-xl bg-white dark:bg-gray-800">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Progreso de compra</span>
              <span className="text-xs font-medium text-gray-900 dark:text-white">
                {purchasedCount}/{list.items.length}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
                initial={{ width: 0 }}
                animate={{
                  width: `${list.items.length > 0 ? (purchasedCount / list.items.length) * 100 : 0}%`,
                }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items list */}
      <div className="space-y-2">
        {list.items.map((item) => (
          <Card key={item.id} className="border-0 shadow-sm rounded-xl bg-white dark:bg-gray-800">
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                {list.status === "shopping" && (
                  <Checkbox
                    checked={item.isPurchased}
                    onCheckedChange={(checked) =>
                      handleTogglePurchased(item.id, checked as boolean)
                    }
                    className="mt-0.5"
                  />
                )}
                {list.status === "verified" && (
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={(checked) =>
                      handleToggleChecked(item.id, checked as boolean)
                    }
                    className="mt-0.5"
                  />
                )}
                {list.status === "completed" && (
                  <CheckCircle2 className="size-4 text-green-500 mt-0.5 shrink-0" />
                )}

                {/* Item details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        item.isPurchased && list.status !== "draft"
                          ? "line-through text-gray-400 dark:text-gray-500"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {item.name}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {item.quantity} {unitLabels[item.unit] || item.unit}
                  </span>
                </div>

                {/* Price section */}
                <div className="text-right shrink-0">
                  {list.status === "verified" ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        value={item.actualPrice ?? ""}
                        onChange={(e) =>
                          handleUpdateActualPrice(
                            item.id,
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-20 h-7 text-xs rounded-lg text-right"
                      />
                    </div>
                  ) : (
                    <>
                      {item.estimatedPrice && (
                        <span className="text-xs text-gray-500">
                          ~{formatCurrency(item.estimatedPrice * item.quantity)}
                        </span>
                      )}
                      {item.actualPrice && list.status === "completed" && (
                        <span className="text-xs font-medium text-gray-900 dark:text-white">
                          {formatCurrency(item.actualPrice * item.quantity)}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Delete button for draft */}
                {list.status === "draft" && (
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="size-6 rounded-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty items */}
      {list.items.length === 0 && (
        <div className="text-center py-8">
          <ShoppingCart className="size-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No hay items en esta lista</p>
        </div>
      )}

      {/* Totals */}
      {list.items.length > 0 && (
        <Card className="border-0 shadow-sm rounded-xl bg-amber-50 dark:bg-amber-900/10">
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Estimado</span>
              <span className="text-gray-900 dark:text-white">{formatCurrency(totalEstimated)}</span>
            </div>
            {(list.status === "verified" || list.status === "completed") && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Real</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(totalActual)}
                </span>
              </div>
            )}
            {totalActual !== totalEstimated && (list.status === "verified" || list.status === "completed") && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Diferencia</span>
                <span
                  className={
                    totalActual > totalEstimated
                      ? "text-red-500"
                      : "text-green-500"
                  }
                >
                  {totalActual > totalEstimated ? "+" : ""}
                  {formatCurrency(totalActual - totalEstimated)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
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

        {list.status === "shopping" && (
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
                      {list.items.filter((i) => i.isPurchased).length} ítems
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
                    .filter((i) => i.isPurchased)
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
            {list.items.some((i) => i.isPurchased) && (
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
                    .filter((i) => i.isPurchased)
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
