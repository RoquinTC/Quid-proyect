"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Wallet, TrendingUp, CreditCard, PiggyBank, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinancePlaceholder() {
  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Finanzas</h2>
          <p className="text-sm text-gray-500">Gestiona tu dinero</p>
        </div>
        <Button className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 shadow-lg shadow-emerald-500/25">
          <Plus className="size-4 mr-1" />
          Nuevo
        </Button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Wallet, label: "Cuentas", value: "0", color: "from-emerald-500 to-teal-500" },
          { icon: TrendingUp, label: "Ingresos", value: "$0", color: "from-blue-500 to-cyan-500" },
          { icon: CreditCard, label: "Deudas", value: "0", color: "from-rose-500 to-pink-500" },
          { icon: PiggyBank, label: "Ahorros", value: "$0", color: "from-amber-500 to-orange-500" },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="border-0 shadow-md rounded-2xl overflow-hidden">
              <CardContent className="p-4">
                <div className={`inline-flex items-center justify-center size-9 rounded-lg bg-gradient-to-br ${item.color} mb-2`}>
                  <Icon className="size-4 text-white" />
                </div>
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="text-lg font-bold text-gray-900">{item.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Coming soon card */}
      <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50">
        <CardContent className="p-6 text-center">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30 mb-3">
            <Wallet className="size-7 text-white" />
          </div>
          <h3 className="font-bold text-gray-900 mb-1">Módulo de Finanzas</h3>
          <p className="text-sm text-gray-500">
            Próximamente: Cuentas, transacciones, presupuestos, deudas y metas de ahorro.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
