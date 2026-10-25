"use client";

import { useEffect, useState } from "react";
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
  Music,
  Play,
  Smartphone,
} from "lucide-react";
import { isNativeAndroid } from "@/lib/native/biometric";
import {
  BUNDLED_SOUNDS,
  DEFAULT_SOUND_CHOICE,
  SILENT_CHOICE,
  SYSTEM_DEFAULT_CHOICE,
  type DoseSoundChoice,
  getDoseSoundChoice,
  pickSoundFromDevice,
  previewSound,
  saveDoseSound,
} from "@/lib/native/notification-sound";
import { syncDoseNotifications, type ReminderDose } from "@/lib/native/medication-reminders";

type HealthSettingsProps = {
  setResetResult: (msg: string | null) => void;
};

const PICK_FROM_DEVICE = "__pick__";

export function HealthSettings({ setResetResult }: HealthSettingsProps) {
  const [medAlerts, setMedAlerts] = useState(true);
  const [medAlertVolume, setMedAlertVolume] = useState("normal");
  const [minDoseWarning, setMinDoseWarning] = useState("5");
  const [calendarSync, setCalendarSync] = useState(false);
  const [clinicPrivacy, setClinicPrivacy] = useState(true);

  const [soundChoice, setSoundChoice] = useState<DoseSoundChoice>(DEFAULT_SOUND_CHOICE);
  const [soundBusy, setSoundBusy] = useState(false);

  useEffect(() => {
    setSoundChoice(getDoseSoundChoice());
  }, []);

  /** Reprograma los avisos abiertos para que usen el canal nuevo. */
  const rescheduleReminders = async () => {
    if (!isNativeAndroid()) return;
    try {
      const response = await fetch("/api/doses?status=pending,snoozed");
      if (!response.ok) return;
      const payload = (await response.json()) as { items?: ReminderDose[] };
      if (payload.items?.length) await syncDoseNotifications(payload.items);
    } catch {
      // Sin red: el próximo arranque de la app reprograma.
    }
  };

  const applyChoice = async (choice: DoseSoundChoice) => {
    setSoundBusy(true);
    try {
      await saveDoseSound(choice);
      setSoundChoice(choice);
      await rescheduleReminders();
      setResetResult(`Sonido de recordatorio: ${choice.title}`);
    } catch {
      setResetResult("No se pudo cambiar el sonido");
    } finally {
      setSoundBusy(false);
      setTimeout(() => setResetResult(null), 2500);
    }
  };

  const onSelectSound = async (value: string) => {
    if (value === PICK_FROM_DEVICE) {
      try {
        const picked = await pickSoundFromDevice();
        if (picked) await applyChoice(picked);
      } catch {
        setResetResult("Selección de sonido cancelada");
        setTimeout(() => setResetResult(null), 2000);
      }
      return;
    }

    const preset = [...BUNDLED_SOUNDS, SYSTEM_DEFAULT_CHOICE, SILENT_CHOICE].find(
      (item) => item.key === value,
    );
    if (preset) await applyChoice(preset);
  };

  const previewCurrent = async () => {
    setSoundBusy(true);
    try {
      await previewSound(soundChoice);
    } finally {
      setTimeout(() => setSoundBusy(false), 600);
    }
  };

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

                  {/* Sonido de la notificación */}
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-700/50 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-8 rounded-lg bg-violet-50 dark:bg-violet-950/20 flex items-center justify-center shrink-0">
                          <Music className="size-3.5 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 dark:text-white">Sonido del recordatorio</p>
                          <p className="text-xs text-gray-400 truncate">{soundChoice.title}</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-xl text-xs shrink-0"
                        onClick={previewCurrent}
                        disabled={soundBusy || soundChoice.source === "silent"}
                      >
                        <Play className="size-3.5 mr-1" />
                        Probar
                      </Button>
                    </div>

                    <Select value={soundChoice.key} onValueChange={onSelectSound} disabled={soundBusy}>
                      <SelectTrigger className="w-full rounded-xl text-xs h-9">
                        <SelectValue placeholder="Elegir sonido" />
                      </SelectTrigger>
                      <SelectContent>
                        {BUNDLED_SOUNDS.map((option) => (
                          <SelectItem key={option.key} value={option.key}>
                            {option.title}
                          </SelectItem>
                        ))}
                        <SelectItem value={SYSTEM_DEFAULT_CHOICE.key}>
                          {SYSTEM_DEFAULT_CHOICE.title}
                        </SelectItem>
                        <SelectItem value={SILENT_CHOICE.key}>{SILENT_CHOICE.title}</SelectItem>
                        {isNativeAndroid() && (
                          <SelectItem value={PICK_FROM_DEVICE}>
                            Elegir del teléfono…
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>

                    {soundChoice.source === "custom" && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Smartphone className="size-3" />
                        Sonido elegido del dispositivo
                      </Badge>
                    )}
                    <p className="text-[11px] text-gray-400 leading-snug">
                      El sonido se guarda en este teléfono. Los avisos ya programados se
                      actualizan al cambiar la opción.
                    </p>
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
