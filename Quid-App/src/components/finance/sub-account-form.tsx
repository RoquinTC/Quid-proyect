"use client";

import { useState, useEffect } from "react";
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

const subAccountTypes = [
  { value: "pocket", label: "Bolsillo" },
  { value: "piggy_bank", label: "Alcancía" },
  { value: "savings_box", label: "Cajita" },
  { value: "other", label: "Otro" },
];

const colorOptions = [
  "#10B981", "#059669", "#0D9488", "#0891B2",
  "#6366F1", "#8B5CF6", "#A855F7", "#EC4899",
  "#F43F5E", "#EF4444", "#F59E0B", "#EAB308",
  "#22C55E", "#14B8A6", "#3B82F6", "#64748B",
];

interface SubAccountFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  subAccount?: {
    id: string;
    name: string;
    type: string;
    balance: number;
    isHighYield: boolean;
    yieldPercentage?: number | null;
    color?: string | null;
    icon?: string | null;
    excludeFromAvailable?: boolean;
  } | null;
  onSuccess?: () => void;
}

export function SubAccountForm({ open, onOpenChange, accountId, subAccount, onSuccess }: SubAccountFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("pocket");
  const [color, setColor] = useState("#10B981");
  const [balance, setBalance] = useState("0");
  const [isHighYield, setIsHighYield] = useState(false);
  const [yieldPercentage, setYieldPercentage] = useState("");
  const [excludeFromAvailable, setExcludeFromAvailable] = useState(false);

  const isEditing = !!subAccount;

  // Sync form state when subAccount changes or dialog opens
  useEffect(() => {
    if (open) {
      if (subAccount) {
        setName(subAccount.name || "");
        setType(subAccount.type || "pocket");
        setColor(subAccount.color || "#10B981");
        setBalance(subAccount.balance?.toString() || "0");
        setIsHighYield(subAccount.isHighYield || false);
        setYieldPercentage(subAccount.yieldPercentage?.toString() || "");
        setExcludeFromAvailable(subAccount.excludeFromAvailable || false);
      } else {
        setName("");
        setType("pocket");
        setColor("#10B981");
        setBalance("0");
        setIsHighYield(false);
        setYieldPercentage("");
        setExcludeFromAvailable(false);
      }
    }
  }, [open, subAccount]);

  const handleSubmit = async () => {
    if (!name) return;
    setLoading(true);
    try {
      const data: Record<string, unknown> = {
        name,
        type,
        color,
        balance: parseFloat(balance) || 0,
        isHighYield,
        yieldPercentage: isHighYield ? parseFloat(yieldPercentage) || null : null,
        excludeFromAvailable,
      };

      if (isEditing) {
        await apiFetch(`/api/accounts/${accountId}/sub-accounts/${subAccount.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      } else {
        await apiFetch(`/api/accounts/${accountId}/sub-accounts`, {
          method: "POST",
          body: JSON.stringify(data),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving sub-account:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (!subAccount) {
      setName("");
      setType("pocket");
      setColor("#10B981");
      setBalance("0");
      setIsHighYield(false);
      setYieldPercentage("");
      setExcludeFromAvailable(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl" scrollable>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>
            {isEditing ? "Editar Bolsillo" : "Nuevo Bolsillo"}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subName">Nombre</Label>
            <Input
              id="subName"
              placeholder="Ej: Vacaciones, Emergencias"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {subAccountTypes.map((t) => (
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

          <div className="space-y-2">
            <Label htmlFor="subBalance">
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
            {isEditing && subAccount.balance !== parseFloat(balance) && (
              <p className="text-[10px] text-gray-400">
                Balance actual: {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(subAccount.balance)}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Alto rendimiento</Label>
              <p className="text-[10px] text-gray-400">Genera rendimientos mensuales</p>
            </div>
            <Switch checked={isHighYield} onCheckedChange={setIsHighYield} />
          </div>

          {/* Exclude from available */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Excluir de disponible</Label>
              <p className="text-[10px] text-gray-400">No contar en el dinero disponible para gastar</p>
            </div>
            <Switch checked={excludeFromAvailable} onCheckedChange={setExcludeFromAvailable} />
          </div>

          {isHighYield && (
            <div className="space-y-2">
              <Label>% Rendimiento Anual</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Ej: 11.5"
                value={yieldPercentage}
                onChange={(e) => setYieldPercentage(e.target.value)}
                className="rounded-xl"
              />
            </div>
          )}

        </DialogBody>

        <DialogStickyFooter>
          <Button
            onClick={handleSubmit}
            disabled={loading || !name}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500"
          >
            {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {isEditing ? "Guardar Cambios" : "Crear Bolsillo"}
          </Button>
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  );
}
