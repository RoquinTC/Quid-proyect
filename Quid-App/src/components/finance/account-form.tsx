"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogStickyFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { Loader2, AlertTriangle } from "lucide-react";

const accountTypes = [
  { value: "checking", label: "Cuenta Corriente" },
  { value: "savings", label: "Cuenta de Ahorros" },
  { value: "cash", label: "Efectivo" },
  { value: "digital_wallet", label: "Billetera Digital" },
  { value: "credit_card", label: "Tarjeta de Crédito" },
  { value: "other", label: "Otra" },
];

const colorOptions = [
  "#10B981", "#059669", "#0D9488", "#0891B2",
  "#6366F1", "#8B5CF6", "#A855F7", "#EC4899",
  "#F43F5E", "#EF4444", "#F59E0B", "#EAB308",
  "#22C55E", "#14B8A6", "#3B82F6", "#64748B",
];

interface AccountFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: {
    id: string;
    name: string;
    type: string;
    color: string;
    balance: number;
    isHighYield: boolean;
    yieldPercentage?: number | null;
    isShared: boolean;
    excludeFromAvailable?: boolean;
  } | null;
  onSuccess?: () => void;
}

export function AccountForm({ open, onOpenChange, account, onSuccess }: AccountFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(account?.name || "");
  const [type, setType] = useState(account?.type || "checking");
  const [color, setColor] = useState(account?.color || "#10B981");
  const [balance, setBalance] = useState(account?.balance?.toString() || "0");
  const [isHighYield, setIsHighYield] = useState(account?.isHighYield || false);
  const [yieldPercentage, setYieldPercentage] = useState(
    account?.yieldPercentage?.toString() || ""
  );
  const [isShared, setIsShared] = useState(account?.isShared || false);
  const [excludeFromAvailable, setExcludeFromAvailable] = useState(account?.excludeFromAvailable || false);

  const isEditing = !!account;

  const handleSubmit = async () => {
    if (!name) return;
    setLoading(true);
    try {
      const data: Record<string, unknown> = {
        name,
        type,
        color,
        isHighYield,
        yieldPercentage: isHighYield ? parseFloat(yieldPercentage) || null : null,
        isShared,
        excludeFromAvailable,
      };

      // Always send balance (for both create and edit)
      data.balance = parseFloat(balance) || 0;

      if (isEditing) {
        await apiFetch(`/api/accounts/${account.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      } else {
        await apiFetch("/api/accounts", {
          method: "POST",
          body: JSON.stringify(data),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving account:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (!account) {
      setName("");
      setType("checking");
      setColor("#10B981");
      setBalance("0");
      setIsHighYield(false);
      setYieldPercentage("");
      setIsShared(false);
      setExcludeFromAvailable(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl" scrollable>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>
            {isEditing ? "Editar Cuenta" : "Nueva Cuenta"}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              placeholder="Ej: Cuenta Bancolombia"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Tipo de Cuenta</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accountTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`size-8 rounded-full transition-transform ${
                    color === c ? "scale-125 ring-2 ring-offset-2 ring-gray-400" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Balance - now also shown when editing */}
          <div className="space-y-2">
            <Label htmlFor="balance">
              {isEditing ? "Ajustar Balance" : "Balance Inicial"}
            </Label>
            {isEditing && (
              <div className="flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                <span className="text-[11px] text-amber-700 dark:text-amber-400">
                  Ajustar el saldo reemplazará el balance actual. Úsalo solo si necesitas corregir diferencias.
                </span>
              </div>
            )}
            <CurrencyInput value={balance} onChange={setBalance} showPrefix placeholder="0" className="rounded-xl" />
            {isEditing && account.balance !== parseFloat(balance) && (
              <p className="text-[10px] text-gray-400">
                Balance actual: {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(account.balance)}
              </p>
            )}
          </div>

          {/* High Yield */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Cuenta de alto rendimiento</Label>
              <p className="text-[10px] text-gray-400">
                Genera rendimientos mensuales
              </p>
            </div>
            <Switch checked={isHighYield} onCheckedChange={setIsHighYield} />
          </div>

          {isHighYield && (
            <div className="space-y-2">
              <Label htmlFor="yieldPercentage">% Rendimiento Anual</Label>
              <Input
                id="yieldPercentage"
                type="number"
                step="0.01"
                placeholder="Ej: 11.5"
                value={yieldPercentage}
                onChange={(e) => setYieldPercentage(e.target.value)}
                className="rounded-xl"
              />
            </div>
          )}

          {/* Shared */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Cuenta compartida</Label>
              <p className="text-[10px] text-gray-400">
                Compartir con otras personas
              </p>
            </div>
            <Switch checked={isShared} onCheckedChange={setIsShared} />
          </div>

          {/* Exclude from available */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Excluir de disponible</Label>
              <p className="text-[10px] text-gray-400">
                No contar este saldo en el dinero disponible para gastar
              </p>
            </div>
            <Switch checked={excludeFromAvailable} onCheckedChange={setExcludeFromAvailable} />
          </div>

        </DialogBody>

        <DialogStickyFooter>
          <Button
            onClick={handleSubmit}
            disabled={loading || !name}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            {isEditing ? "Guardar Cambios" : "Crear Cuenta"}
          </Button>
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  );
}
