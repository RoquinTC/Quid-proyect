"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Heart, Pill, Stethoscope, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HealthPlaceholder() {
  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Salud</h2>
          <p className="text-sm text-gray-500">Tu bienestar personal</p>
        </div>
        <Button className="rounded-xl bg-gradient-to-r from-rose-600 to-pink-500 shadow-lg shadow-rose-500/25">
          <Plus className="size-4 mr-1" />
          Nuevo
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Pill, label: "Medicamentos", value: "0", color: "from-rose-500 to-pink-500" },
          { icon: Stethoscope, label: "Citas Médicas", value: "0", color: "from-violet-500 to-purple-500" },
          { icon: Heart, label: "Perfiles", value: "0", color: "from-red-500 to-rose-500" },
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

      <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50">
        <CardContent className="p-6 text-center">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 shadow-lg shadow-rose-500/30 mb-3">
            <Heart className="size-7 text-white" />
          </div>
          <h3 className="font-bold text-gray-900 mb-1">Módulo de Salud</h3>
          <p className="text-sm text-gray-500">
            Próximamente: Medicamentos con recordatorios, citas médicas y perfiles de salud.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
