"use client";

import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import type { PaymentMethodType } from "@/lib/types/transport";
import { CreditCard, Landmark, PiggyBank, Wallet, Info } from "lucide-react";

// ─── Account / Debt types from API ───

interface AccountData {
  id: string;
  name: string;
  type: string;
  color: string;
  icon?: string | null;
  balance: number;
  subAccounts?: SubAccountData[];
}

interface SubAccountData {
  id: string;
  name: string;
  type: string;
  balance: number;
  icon?: string | null;
  color?: string | null;
}

interface DebtData {
  id: string;
  name: string;
  type: string; // credit_card, loan, other
  currentBalance: number;
  color: string;
  cutoffDate?: number | null;
  paymentDate?: number | null;
}

interface PaymentMethodSelectorProps {
  /** Pre-selected payment type */
  defaultPaymentType?: PaymentMethodType;
  /** Pre-selected account */
  defaultAccountId?: string | null;
  /** Pre-selected sub-account */
  defaultSubAccountId?: string | null;
  /** Pre-selected debt (TC) */
  defaultDebtId?: string | null;
  /** Pre-selected installment count */
  defaultInstallmentCount?: number | null;
  /** Vehicle ID — used to fetch default payment method */
  vehicleId?: string;
  /** Called when any payment field changes */
  onChange: (data: {
    paymentType: PaymentMethodType;
    accountId: string | null;
    subAccountId: string | null;
    debtId: string | null;
    installmentCount: number | null;
  }) => void;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Whether payment method is optional (for imports) */
  optional?: boolean;
}

export function PaymentMethodSelector({
  defaultPaymentType,
  defaultAccountId,
  defaultSubAccountId,
  defaultDebtId,
  defaultInstallmentCount,
  vehicleId,
  onChange,
  disabled = false,
  optional = false,
}: PaymentMethodSelectorProps) {
  const [paymentType, setPaymentType] = useState<PaymentMethodType>(
    defaultPaymentType || "account"
  );
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [debts, setDebts] = useState<DebtData[]>([]);
  const [accountId, setAccountId] = useState<string | null>(defaultAccountId || null);
  const [subAccountId, setSubAccountId] = useState<string | null>(defaultSubAccountId || null);
  const [debtId, setDebtId] = useState<string | null>(defaultDebtId || null);
  const [installmentCount, setInstallmentCount] = useState<number | null>(
    defaultInstallmentCount || null
  );
  const [loading, setLoading] = useState(true);

  // Fetch accounts and debts
  const fetchFinanceData = useCallback(async () => {
    try {
      const [accountsData, debtsData] = await Promise.all([
        apiFetch<AccountData[]>("/api/accounts"),
        apiFetch<DebtData[]>("/api/debts"),
      ]);
      setAccounts(accountsData || []);
      setDebts((debtsData || []).filter(d => d.type === "credit_card"));
    } catch (error) {
      console.error("Error fetching finance data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch vehicle's default payment method
  const fetchPaymentDefault = useCallback(async () => {
    if (!vehicleId) return;
    try {
      const data = await apiFetch<{
        paymentType: PaymentMethodType;
        accountId?: string | null;
        subAccountId?: string | null;
        debtId?: string | null;
        installmentCount?: number | null;
      }>(`/api/vehicles/${vehicleId}/payment-default`);

      if (data && !defaultPaymentType) {
        setPaymentType(data.paymentType || "account");
        if (data.accountId && !defaultAccountId) setAccountId(data.accountId);
        if (data.subAccountId && !defaultSubAccountId) setSubAccountId(data.subAccountId);
        if (data.debtId && !defaultDebtId) setDebtId(data.debtId);
        if (data.installmentCount && !defaultInstallmentCount) setInstallmentCount(data.installmentCount);
      }
    } catch (error) {
      // No default set — that's fine, use defaults
    }
  }, [vehicleId, defaultPaymentType, defaultAccountId, defaultSubAccountId, defaultDebtId, defaultInstallmentCount]);

  useEffect(() => {
    fetchFinanceData();
  }, [fetchFinanceData]);

  useEffect(() => {
    fetchPaymentDefault();
  }, [fetchPaymentDefault]);

  // Notify parent of changes
  useEffect(() => {
    onChange({
      paymentType,
      // For account payment: accountId/subAccountId are the payment source
      // For CC payment: accountId/subAccountId are where the CC will be paid from
      accountId,
      subAccountId,
      debtId: paymentType === "credit_card" ? debtId : null,
      installmentCount: paymentType === "credit_card" ? installmentCount : null,
    });
  }, [paymentType, accountId, subAccountId, debtId, installmentCount, onChange]);

  // Reset sub-account when account changes
  const handleAccountChange = (value: string) => {
    setAccountId(value || null);
    setSubAccountId(null);
  };

  // Selected account for sub-account display
  const selectedAccount = accounts.find(a => a.id === accountId);
  const hasSubAccounts = selectedAccount?.subAccounts && selectedAccount.subAccounts.length > 0;

  // Credit cards only
  const creditCards = debts.filter(d => d.type === "credit_card");

  return (
    <div className="space-y-3">
      {/* ── Payment Type Toggle ── */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Método de pago</Label>
        {optional && (
          <p className="text-[10px] text-gray-400">
            Opcional para datos históricos. Obligatorio para registros nuevos.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPaymentType("account")}
            className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 transition-all text-sm font-medium ${
              paymentType === "account"
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300"
            }`}
          >
            <Landmark className="size-4" />
            Cuenta
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPaymentType("credit_card")}
            className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 transition-all text-sm font-medium ${
              paymentType === "credit_card"
                ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300"
                : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300"
            }`}
          >
            <CreditCard className="size-4" />
            Tarjeta de Crédito
          </button>
        </div>
      </div>

      {/* ── Account Selection ── */}
      {paymentType === "account" && (
        <div className="space-y-3 p-3 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-900/20">
          {/* Account */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-gray-600 dark:text-gray-400">
              Pagar desde
            </Label>
            <Select
              value={accountId || ""}
              onValueChange={handleAccountChange}
              disabled={disabled || loading}
            >
              <SelectTrigger className="rounded-xl h-9 text-sm">
                <SelectValue placeholder={loading ? "Cargando..." : "Seleccionar cuenta"} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="size-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: account.color || "#10B981" }}
                      />
                      <span>{account.name}</span>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        ${account.balance?.toLocaleString("es-CO")}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sub-account (bolsillo) */}
          {hasSubAccounts && (
            <div className="space-y-1.5">
              <Label className="text-[11px] text-gray-600 dark:text-gray-400">
                Bolsillo (opcional)
              </Label>
              <Select
                value={subAccountId || "main"}
                onValueChange={(v) => setSubAccountId(v === "main" ? null : v)}
                disabled={disabled}
              >
                <SelectTrigger className="rounded-xl h-9 text-sm">
                  <SelectValue placeholder="Toda la cuenta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">
                    <div className="flex items-center gap-2">
                      <Wallet className="size-3 text-gray-400" />
                      <span>Toda la cuenta</span>
                    </div>
                  </SelectItem>
                  {selectedAccount!.subAccounts!.map(sub => (
                    <SelectItem key={sub.id} value={sub.id}>
                      <div className="flex items-center gap-2">
                        <PiggyBank className="size-3 text-pink-400" />
                        <span>{sub.name}</span>
                        <span className="text-[10px] text-gray-400 ml-auto">
                          ${sub.balance?.toLocaleString("es-CO")}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Info box */}
          {accountId && (
            <div className="flex items-start gap-1.5 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Info className="size-3 text-blue-500 mt-0.5 flex-shrink-0" />
              <span className="text-[10px] text-blue-600 dark:text-blue-400">
                Se debitará de {selectedAccount?.name}
                {subAccountId && selectedAccount?.subAccounts
                  ? ` → ${selectedAccount.subAccounts.find(s => s.id === subAccountId)?.name || "bolsillo"}`
                  : ""
                }
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Credit Card Selection ── */}
      {paymentType === "credit_card" && (
        <div className="space-y-3 p-3 bg-violet-50/50 dark:bg-violet-900/10 rounded-xl border border-violet-100 dark:border-violet-900/20">
          {/* Credit Card */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-gray-600 dark:text-gray-400">
              Tarjeta de crédito
            </Label>
            <Select
              value={debtId || ""}
              onValueChange={setDebtId}
              disabled={disabled || loading}
            >
              <SelectTrigger className="rounded-xl h-9 text-sm">
                <SelectValue placeholder={loading ? "Cargando..." : "Seleccionar TC"} />
              </SelectTrigger>
              <SelectContent>
                {creditCards.map(cc => (
                  <SelectItem key={cc.id} value={cc.id}>
                    <div className="flex items-center gap-2">
                      <CreditCard className="size-3" style={{ color: cc.color || "#8B5CF6" }} />
                      <span>{cc.name}</span>
                      <span className="text-[10px] text-gray-400 ml-auto">
                        Saldo: ${cc.currentBalance?.toLocaleString("es-CO")}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Installment count */}
          {debtId && (
            <div className="space-y-1.5">
              <Label className="text-[11px] text-gray-600 dark:text-gray-400">
                Número de cuotas
              </Label>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 6, 9, 12, 18, 24].map(n => (
                  <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    onClick={() => setInstallmentCount(n)}
                    className={`p-2 rounded-lg text-xs font-medium transition-all ${
                      installmentCount === n
                        ? "bg-violet-500 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {n === 1 ? "Contado" : `${n}`}
                  </button>
                ))}
              </div>
              {installmentCount && installmentCount > 1 && (
                <p className="text-[10px] text-violet-500">
                  Se creará una compra en {installmentCount} cuotas en la TC
                </p>
              )}
            </div>
          )}

          {/* Account/Sub-account for TC payment source */}
          {debtId && (
            <div className="space-y-2 pt-2 border-t border-violet-200 dark:border-violet-800/30">
              <Label className="text-[11px] text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                <Landmark className="size-3" />
                Cuenta de pago de la TC
              </Label>
              <p className="text-[9px] text-gray-400">
                Se debitará de esta cuenta al pagar la tarjeta de crédito
              </p>
              <Select
                value={accountId || ""}
                onValueChange={handleAccountChange}
                disabled={disabled || loading}
              >
                <SelectTrigger className="rounded-xl h-9 text-sm">
                  <SelectValue placeholder={loading ? "Cargando..." : "Seleccionar cuenta"} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(account => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="size-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: account.color || "#10B981" }}
                        />
                        <span>{account.name}</span>
                        <span className="text-[10px] text-gray-400 ml-auto">
                          ${account.balance?.toLocaleString("es-CO")}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Sub-account (bolsillo) for TC payment */}
              {hasSubAccounts && (
                <Select
                  value={subAccountId || "main"}
                  onValueChange={(v) => setSubAccountId(v === "main" ? null : v)}
                  disabled={disabled}
                >
                  <SelectTrigger className="rounded-xl h-9 text-sm">
                    <SelectValue placeholder="Toda la cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">
                      <div className="flex items-center gap-2">
                        <Wallet className="size-3 text-gray-400" />
                        <span>Toda la cuenta</span>
                      </div>
                    </SelectItem>
                    {selectedAccount!.subAccounts!.map(sub => (
                      <SelectItem key={sub.id} value={sub.id}>
                        <div className="flex items-center gap-2">
                          <PiggyBank className="size-3 text-pink-400" />
                          <span>{sub.name}</span>
                          <span className="text-[10px] text-gray-400 ml-auto">
                            ${sub.balance?.toLocaleString("es-CO")}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Info box */}
          {debtId && (
            <div className="flex items-start gap-1.5 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Info className="size-3 text-blue-500 mt-0.5 flex-shrink-0" />
              <span className="text-[10px] text-blue-600 dark:text-blue-400">
                Se registrará como compra en {creditCards.find(c => c.id === debtId)?.name}
                {installmentCount && installmentCount > 1
                  ? ` a ${installmentCount} cuotas`
                  : " de contado"
                }.
                {accountId
                  ? ` Al pagar la TC, se debitará de ${selectedAccount?.name}${subAccountId ? ` → ${selectedAccount?.subAccounts?.find(s => s.id === subAccountId)?.name || "bolsillo"}` : ""}.`
                  : " Configura la cuenta desde donde se pagará la TC."
                }
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
