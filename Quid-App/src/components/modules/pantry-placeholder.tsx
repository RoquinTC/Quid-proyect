"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ShoppingBasket, Package, ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PantryPlaceholder() {
  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Despensa</h2>
          <p className="text-sm text-gray-500">Tu inventario en casa</p>
        </div>
        <Button className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 shadow-lg shadow-amber-500/25">
          <Plus className="size-4 mr-1" />
          Nuevo
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Package, label: "Productos", value: "0", color: "from-amber-500 to-orange-500" },
          { icon: ClipboardList, label: "Listas de Compra", value: "0", color: "from-emerald-500 to-teal-500" },
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

      <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50">
        <CardContent className="p-6 text-center">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30 mb-3">
            <ShoppingBasket className="size-7 text-white" />
          </div>
          <h3 className="font-bold text-gray-900 mb-1">Módulo de Despensa</h3>
          <p className="text-sm text-gray-500">
            Próximamente: Inventario de productos, listas de compras inteligentes y alertas de stock bajo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
