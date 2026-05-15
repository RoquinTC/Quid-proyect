"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Loader2, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";

const quickAmounts = [10000, 20000, 50000, 100000, 200000, 500000];

interface LinkedAccount {
  id: string;
  accountId: string;
  subAccountId?: string | null;
  account: { id: string; name: string; type: string; color: string; balance: number };
  subAccount?: { id: string; name: string; balance: number } | null;
}

interface SavingsContributeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalId: string;
  goalName: string;
  linkedAccounts?: LinkedAccount[];
  onSuccess?: () => void;
}

export function SavingsContributeForm({
  open,
  onOpenChange,
  goalId,
  goalName,
  linkedAccounts = [],
  onSuccess,
}: SavingsContributeFormProps) {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedSubAccountId, setSelectedSubAccountId] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        amount: parseFloat(amount),
        description: description || null,
      };

      // If user selected an account, send it so the API creates a transaction and deducts from account
      if (selectedAccountId) {
        body.accountId = selectedAccountId;
        if (selectedSubAccountId) {
          body.subAccountId = selectedSubAccountId;
        }
      }

      await apiFetch(`/api/savings/${goalId}/contribute`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      toast.success(`Aporte de ${formatCurrency(parseFloat(amount))} registrado`);
      onSuccess?.();
      onOpenChange(false);
      setAmount("");
      setDescription("");
      setSelectedAccountId("");
    } catch (error) {
      console.error("Error contributing:", error);
      toast.error("Error al registrar el aporte");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-t-2xl sm:rounded-2xl">
        <SheetHeader>
          <SheetTitle>Aportar a {goalName}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Monto</Label>
            <CurrencyInput value={amount} onChange={setAmount} showPrefix placeholder="0" className="rounded-xl text-xl font-bold h-14" />
            <div className="grid grid-cols-3 gap-2">
              {quickAmounts.map((qa) => (
                <button
                  key={qa}
                  onClick={() => setAmount(qa.toString())}
                  className="py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-[10px] font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {formatCurrency(qa)}
                </button>
              ))}
            </div>
          </div>

          {/* Account selector — pick which account the money comes from */}
          {linkedAccounts.length > 0 && (
            <div className="space-y-2">
              <Label>Descontar de (opcional)</Label>
              <select
                value={selectedSubAccountId ? `sub-${selectedSubAccountId}` : selectedAccountId}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith("sub-")) {
                    const subId = val.replace("sub-", "");
                    const link = linkedAccounts.find((l) => l.subAccountId === subId);
                    setSelectedAccountId(link?.accountId || "");
                    setSelectedSubAccountId(subId);
                  } else if (val) {
                    setSelectedAccountId(val);
                    setSelectedSubAccountId(null);
                  } else {
                    setSelectedAccountId("");
                    setSelectedSubAccountId(null);
                  }
                }}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">No descontar de ninguna cuenta</option>
                {linkedAccounts.map((link) => (
                  <option key={link.id} value={link.subAccountId ? `sub-${link.subAccountId}` : link.accountId}>
                    {link.subAccount ? link.subAccount.name : link.account.name} ({formatCurrency(link.subAccount ? link.subAccount.balance : link.account.balance)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Descripción (opcional)</Label>
            <Input
              placeholder="Ej: Ahorro quincenal"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-violet-500 h-12"
          >
            {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
            Aportar {amount ? formatCurrency(parseFloat(amount)) : ""}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
