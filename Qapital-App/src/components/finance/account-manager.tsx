"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Banknote,
  Wallet,
  CircleDollarSign,
  Smartphone,
  CreditCard,
  Trash2,
  Loader2,
  AlertTriangle,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import type { Account, SubAccount } from "@/lib/types";

const typeIcons: Record<string, typeof Wallet> = {
  checking: Banknote,
  savings: Wallet,
  cash: CircleDollarSign,
  digital_wallet: Smartphone,
  credit_card: CreditCard,
  other: Wallet,
};

const typeLabels: Record<string, string> = {
  checking: "Corriente",
  savings: "Ahorros",
  cash: "Efectivo",
  digital_wallet: "Billetera Digital",
  credit_card: "Tarjeta de Crédito",
  other: "Otra",
};

export function AccountManager() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await apiFetch<Account[]>("/api/accounts");
      setAccounts(data);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      toast.error("Error al cargar cuentas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAccounts().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchAccounts]);

  const handleDelete = async (accountId: string) => {
    setDeletingId(accountId);
    try {
      await apiFetch(`/api/accounts/${accountId}`, { method: "DELETE" });
      toast.success("Cuenta eliminada");
      fetchAccounts();
    } catch (error: any) {
      console.error("Error deleting account:", error);
      toast.error(error.message || "Error al eliminar la cuenta");
    } finally {
      setDeletingId(null);
      setShowDeleteDialog(null);
    }
  };

  // Find potential duplicates (same name trimmed, different IDs)
  const duplicateGroups = (() => {
    const groups = new Map<string, Account[]>();
    for (const acc of accounts) {
      const key = acc.name.trim().toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(acc);
    }
    return Array.from(groups.entries()).filter(([, accs]) => accs.length > 1);
  })();

  const duplicateIds = new Set(
    duplicateGroups.flatMap(([, accs]) => accs.slice(1).map((a) => a.id))
  );

  if (loading) {
    return (
      <Card className="border-0 shadow-sm rounded-xl">
        <CardContent className="p-4 flex items-center justify-center min-h-[100px]">
          <Loader2 className="size-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-gray-400">
          {accounts.length} cuenta{accounts.length !== 1 ? "s" : ""} registrada{accounts.length !== 1 ? "s" : ""}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 rounded-lg"
          onClick={fetchAccounts}
        >
          <RefreshCw className="size-3.5 text-gray-400" />
        </Button>
      </div>

      {/* Duplicate warning */}
      {duplicateGroups.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
              Cuentas duplicadas detectadas
            </p>
            <p className="text-[10px] text-amber-500/70 mt-0.5">
              Las siguientes cuentas tienen nombres similares y podrían ser duplicados. Revisa y elimina las que no necesites.
            </p>
          </div>
        </div>
      )}

      {/* Account List */}
      <div className="space-y-2">
        {accounts.map((account) => {
          const Icon = typeIcons[account.type] || Wallet;
          const isDuplicate = duplicateIds.has(account.id);
          const hasTrailingSpace = account.name !== account.name.trim();
          const totalWithSubs = account.balance + (account.subAccounts || []).reduce((s, sa) => s + sa.balance, 0);

          return (
            <Card
              key={account.id}
              className={`border-0 shadow-sm rounded-xl ${
                isDuplicate
                  ? "ring-2 ring-amber-300 dark:ring-amber-700 bg-amber-50/30 dark:bg-amber-900/10"
                  : ""
              }`}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div
                    className="size-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${account.color}20` }}
                  >
                    <Icon className="size-4" style={{ color: account.color }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {account.name}
                      </p>
                      {hasTrailingSpace && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 border-amber-300 text-amber-600">
                          espacio extra
                        </Badge>
                      )}
                      {isDuplicate && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 border-amber-300 text-amber-600">
                          posible duplicado
                        </Badge>
                      )}
                      {account.excludeFromAvailable && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 border-gray-300 text-gray-500">
                          excluida
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400">
                        {typeLabels[account.type] || "Cuenta"}
                      </span>
                      {account.subAccounts.length > 0 && (
                        <span className="text-[10px] text-gray-400">
                          · {account.subAccounts.length} bolsillo{account.subAccounts.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Balance */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">
                      {formatCurrency(totalWithSubs)}
                    </p>
                    {account.subAccounts.length > 0 && (
                      <p className="text-[9px] text-gray-400">
                        Cuenta: {formatCurrency(account.balance)}
                      </p>
                    )}
                  </div>

                  {/* Delete button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
                    onClick={() => setShowDeleteDialog(account.id)}
                    disabled={deletingId === account.id}
                  >
                    {deletingId === account.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {accounts.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          No hay cuentas registradas
        </p>
      )}

      {/* Delete Dialog */}
      <AlertDialog
        open={showDeleteDialog !== null}
        onOpenChange={(open) => {
          if (!open) setShowDeleteDialog(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta cuenta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la cuenta junto con todos sus bolsillos y transacciones asociadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-500 hover:bg-red-600"
              onClick={() => showDeleteDialog && handleDelete(showDeleteDialog)}
              disabled={deletingId !== null}
            >
              {deletingId ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
