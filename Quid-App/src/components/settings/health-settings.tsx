"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Heart,
  Pill,
  Calendar,
  Lock,
  Bell,
  Stethoscope,
  ShieldCheck,
  EyeOff,
} from "lucide-react";

type HealthSettingsProps = {
  setResetResult: (msg: string | null) => void;
};

export function HealthSettings({ setResetResult }: HealthSettingsProps) {
  const [medAlerts, setMedAlerts] = useState(true);
  const [medAlertVolume, setMedAlertVolume] = useState("normal");
  const [minDoseWarning, setMinDoseWarning] = useState("5");
  const [calendarSync, setCalendarSync] = useState(false);
  const [clinicPrivacy, setClinicPrivacy] = useState(true);

  const saveSettings = () => {
    setResetResult("Ajustes de salud guardados");
    setTimeout(() => setResetResult(null), 2000);
  };

  return (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={[]} className="space-y-2">
        {/* Medicamentos e Inventario */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="medicamentos" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                  <Pill className="size-4 text-rose-500" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Tomas e Inventario de Medicinas</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center">
                        <Bell className="size-3.5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Recordatorios de Dosis</p>
                        <p className="text-xs text-gray-400">Recibir alertas en cada horario</p>
                      </div>
                    </div>
                    <Switch checked={medAlerts} onCheckedChange={setMedAlerts} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center">
                        <Pill className="size-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Advertencia de stock bajo</p>
                        <p className="text-xs text-gray-400">Reabastecer cuando queden menos de</p>
                      </div>
                    </div>
                    <Select value={minDoseWarning} onValueChange={setMinDoseWarning}>
                      <SelectTrigger className="w-24 rounded-xl text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 dosis</SelectItem>
                        <SelectItem value="5">5 dosis</SelectItem>
                        <SelectItem value="10">10 dosis</SelectItem>
                        <SelectItem value="20">20 dosis</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Citas Médicas */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="citas" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <Calendar className="size-4 text-blue-500" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Citas y Calendarios</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center">
                        <Stethoscope className="size-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Sincronización de Calendario</p>
                        <p className="text-xs text-gray-400">Agregar citas automáticamente al móvil</p>
                      </div>
                    </div>
                    <Switch checked={calendarSync} onCheckedChange={setCalendarSync} />
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Privacidad Clínica */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="privacidad" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                  <Lock className="size-4 text-rose-500" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Privacidad y Diagnósticos</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center">
                        <EyeOff className="size-3.5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Ocultar notas clínicas</p>
                        <p className="text-xs text-gray-400">Requiere desbloqueo biométrico para ver notas</p>
                      </div>
                    </div>
                    <Switch checked={clinicPrivacy} onCheckedChange={setClinicPrivacy} />
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>
      </Accordion>

      <Button
        className="w-full bg-gradient-to-br from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white rounded-xl py-5 shadow-md shadow-rose-500/10 font-bold text-xs"
        onClick={saveSettings}
      >
        Guardar Configuración de Salud
      </Button>
    </div>
  );
}
