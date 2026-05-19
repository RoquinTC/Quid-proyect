"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { ShoppingItemForm } from "./shopping-item-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { motion } from "framer-motion";
import type { ShoppingListItem, ShoppingList, HealthProfile } from "@/lib/types";

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
  const [showItemForm, setShowItemForm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [healthProfiles, setHealthProfiles] = useState<HealthProfile[]>([]);

  const fetchList = useCallback(async () => {
    try {
      const data = await apiFetch<ShoppingList>(`/api/shopping-lists/${listId}`);
      setList(data);
    } catch (error) {
      console.error("Error fetching list:", error);
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

  useEffect(() => {
    fetchList();
    fetchProfiles();
  }, [fetchList, fetchProfiles]);

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

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await apiFetch(`/api/shopping-lists/${listId}/confirm`, {
        method: "POST",
      });
      await fetchList();
    } catch (error) {
      console.error("Error confirming list:", error);
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

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!list) return null;

  const totalEstimated = list.items.reduce(
    (sum, i) => sum + (i.estimatedPrice || 0) * i.quantity,
    0
  );
  const totalActual = list.items.reduce(
    (sum, i) => sum + ((i.actualPrice ?? i.estimatedPrice) ?? 0) * i.quantity,
    0
  );
  const purchasedCount = list.items.filter((i) => i.isPurchased).length;

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
            <Badge className={`text-[10px] ${statusColor[list.status]}`}>
              {statusLabel[list.status]}
            </Badge>
            <span className="text-xs text-gray-400">
              {list.items.length} items · {purchasedCount} comprados
            </span>
          </div>
        </div>
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
                      <span className="text-[10px] text-gray-400">$</span>
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
          <Button
            onClick={() => handleStatusChange("verified")}
            disabled={updatingStatus}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-teal-500"
          >
            {updatingStatus ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <ClipboardCheck className="size-4 mr-2" />
            )}
            Verificar Compra
          </Button>
        )}

        {list.status === "verified" && (
          <Button
            onClick={handleConfirm}
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
