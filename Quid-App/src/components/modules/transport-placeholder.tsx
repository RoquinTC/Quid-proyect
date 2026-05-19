"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Bike, Fuel, Wrench, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TransportPlaceholder() {
  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Transporte</h2>
          <p className="text-sm text-gray-500">Tus vehículos y más</p>
        </div>
        <Button className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 shadow-lg shadow-blue-500/25">
          <Plus className="size-4 mr-1" />
          Nuevo
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Bike, label: "Vehículos", value: "0", color: "from-blue-500 to-cyan-500" },
          { icon: Fuel, label: "Combustible", value: "0 registros", color: "from-emerald-500 to-teal-500" },
          { icon: Wrench, label: "Mantenimiento", value: "0", color: "from-amber-500 to-orange-500" },
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

      <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50">
        <CardContent className="p-6 text-center">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/30 mb-3">
            <Bike className="size-7 text-white" />
          </div>
          <h3 className="font-bold text-gray-900 mb-1">Módulo de Transporte</h3>
          <p className="text-sm text-gray-500">
            Próximamente: Registra tus vehículos, controla el consumo de combustible y programa mantenimientos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
