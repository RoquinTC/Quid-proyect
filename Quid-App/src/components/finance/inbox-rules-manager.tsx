"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Zap, Loader2 } from "lucide-react";

/**
 * F-36 · Reglas de clasificación de capturas.
 *
 * Una regla dice: si el mensaje contiene este texto, propone esta categoría,
 * esta cuenta y este tipo. Con eso el arriendo, la tarjeta o el banco de
 * siempre se clasifican solos y solo se revisa lo nuevo.
 *
 * Las reglas solo **proponen**: el usuario sigue confirmando en el formulario.
 */

type Rule = {
  id: string;
  name: string;
  contains: string;
  category: string | null;
  subCategory: string | null;
  accountId: string | null;
  type: string | null;
  priority: number;
  active: boolean;
  hitCount: number;
};

type Account = { id: string; name: string; type: string };

const TYPE_LABEL: Record<string, string> = {
  expense: "Gasto",
  income: "Ingreso",
  transfer: "Transferencia",
};

export function InboxRulesManager() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [contains, setContains] = useState("");
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState("");
  const [type, setType] = useState("");

  const load = useCallback(async () => {
    try {
      const [rulesRes, accountsRes] = await Promise.all([
        apiFetch<{ rules: Rule[] }>("/api/inbox/rules"),
        apiFetch<Account[]>("/api/accounts").catch(() => [] as Account[]),
      ]);
      setRules(rulesRes.rules || []);
      setAccounts(accountsRes || []);
    } catch {
      toast.error("No se pudieron leer las reglas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!name.trim() || contains.trim().length < 2) {
      toast.error("Ponle nombre y el texto a buscar");
      return;
    }
    setCreating(true);
    try {
      await apiFetch("/api/inbox/rules", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          contains: contains.trim(),
          category: category.trim() || null,
          accountId: accountId || null,
          type: type || null,
        }),
      });
      setName("");
      setContains("");
      setCategory("");
      setAccountId("");
      setType("");
      toast.success("Regla creada");
      await load();
    } catch {
      toast.error("No se pudo crear la regla");
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (rule: Rule) => {
    try {
      await apiFetch("/api/inbox/rules", {
        method: "PUT",
        body: JSON.stringify({ id: rule.id, active: !rule.active }),
      });
      await load();
    } catch {
      toast.error("No se pudo actualizar la regla");
    }
  };

  const remove = async (rule: Rule) => {
    try {
      await apiFetch("/api/inbox/rules", {
        method: "DELETE",
        body: JSON.stringify({ id: rule.id }),
      });
      toast.success("Regla eliminada");
      await load();
    } catch {
      toast.error("No se pudo eliminar la regla");
    }
  };

  return (
    <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Zap className="size-3.5 text-indigo-500" />
          <p className="text-xs font-medium text-gray-900 dark:text-white">Reglas de captura</p>
          {rules.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              {rules.length}
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-400">
          Si el mensaje contiene el texto, la bandeja propone estos datos. Solo propone: siempre
          confirmas antes de registrar.
        </p>

        {/* Lista */}
        {loading ? (
          <div className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        ) : rules.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic">Todavía no hay reglas.</p>
        ) : (
          <div className="space-y-1.5">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-2 rounded-lg border border-gray-100 dark:border-gray-700/50 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-gray-900 dark:text-white truncate">
                    {rule.name}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">
                    «{rule.contains}»
                    {rule.category ? ` → ${rule.category}` : ""}
                    {rule.type ? ` · ${TYPE_LABEL[rule.type] || rule.type}` : ""}
                  </p>
                </div>
                <Switch checked={rule.active} onCheckedChange={() => toggle(rule)} />
                <button
                  type="button"
                  onClick={() => remove(rule)}
                  className="text-gray-300 hover:text-red-500"
                  aria-label="Eliminar regla"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Nueva regla */}
        <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-gray-700/50">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (ej: Arriendo)"
            className="h-8 text-xs rounded-lg"
          />
          <Input
            value={contains}
            onChange={(e) => setContains(e.target.value)}
            placeholder="Texto a buscar (ej: ARRIENDO)"
            className="h-8 text-xs rounded-lg"
          />
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Categoría a asignar (opcional)"
            className="h-8 text-xs rounded-lg"
          />
          <div className="flex gap-1.5">
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="flex-1 h-8 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2"
            >
              <option value="">Cuenta (sin cambiar)</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-8 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2"
            >
              <option value="">Tipo (sin cambiar)</option>
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
              <option value="transfer">Transferencia</option>
            </select>
          </div>
          <Button
            type="button"
            onClick={create}
            disabled={creating}
            className="w-full h-8 rounded-lg text-[11px]"
          >
            {creating ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Plus className="size-3 mr-1" />}
            Agregar regla
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
