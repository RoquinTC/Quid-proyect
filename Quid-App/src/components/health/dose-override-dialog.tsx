"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Trash2 } from "lucide-react";

type OverrideType = "modify_time" | "modify_dose" | "skip_day";

interface OverrideView {
  id: string;
  day: string;
  type: OverrideType;
  times: string[] | null;
  dose: number | null;
}

interface DoseOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicationId: string;
  medicationName: string;
  /** Día lógico de la toma ("YYYY-MM-DD"). */
  day: string;
  /** Hora actual de la toma, para precargar cuando se mueve. */
  defaultTime: string;
  onSaved?: () => void;
}

/**
 * Excepción de un día concreto: mover la hora, cambiar la dosis o saltar el día.
 *
 * Es la pieza que evita "editar el tratamiento" cuando en realidad solo cambia
 * un día: el patrón base queda intacto y la excepción se puede quitar.
 */
export function DoseOverrideDialog({
  open,
  onOpenChange,
  medicationId,
  medicationName,
  day,
  defaultTime,
  onSaved,
}: DoseOverrideDialogProps) {
  const [type, setType] = useState<OverrideType>("modify_time");
  const [time, setTime] = useState(defaultTime);
  const [dose, setDose] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<OverrideView[]>([]);

  useEffect(() => {
    if (!open) return;
    setType("modify_time");
    setTime(defaultTime);
    setNote("");
    setError(null);

    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ overrides: OverrideView[] }>(
          `/api/medications/${medicationId}/overrides?from=${day}&to=${day}`,
        );
        if (cancelled) return;
        setExisting(data.overrides ?? []);
        const doseOverride = data.overrides?.find((item) => item.type === "modify_dose");
        if (doseOverride?.dose) setDose(String(doseOverride.dose));
        const timeOverride = data.overrides?.find((item) => item.type === "modify_time");
        if (timeOverride?.times?.[0]) setTime(timeOverride.times[0]);
      } catch {
        // Sin overrides previos: se empieza en blanco.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, medicationId, day, defaultTime]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/medications/${medicationId}/overrides`, {
        method: "POST",
        body: JSON.stringify({
          day,
          type,
          ...(type === "modify_time" ? { times: [time] } : {}),
          ...(type === "modify_dose" ? { dose: Number(dose) } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      onOpenChange(false);
      onSaved?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await apiFetch(`/api/overrides/${id}`, { method: "DELETE" });
      onOpenChange(false);
      onSaved?.();
    } catch {
      setError("No se pudo quitar la excepción");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Ajustar solo este día</DialogTitle>
          <DialogDescription className="text-xs">
            {medicationName} · {day}. El resto del tratamiento no cambia.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">¿Qué ajustas?</Label>
            <Select value={type} onValueChange={(value) => setType(value as OverrideType)}>
              <SelectTrigger className="rounded-xl text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modify_time">Mover la hora</SelectItem>
                <SelectItem value="modify_dose">Cambiar la dosis</SelectItem>
                <SelectItem value="skip_day">Saltar este día</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "modify_time" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Nueva hora</Label>
              <Input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="rounded-xl"
              />
            </div>
          )}

          {type === "modify_dose" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Dosis de este día</Label>
              <Input
                type="number"
                min="0.25"
                step="0.25"
                value={dose}
                onChange={(event) => setDose(event.target.value)}
                className="rounded-xl"
              />
            </div>
          )}

          {type === "skip_day" && (
            <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              Se quitan las tomas pendientes de este día. Las ya confirmadas se conservan
              para no alterar el historial.
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Nota (opcional)</Label>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Viaje, cambio de rutina…"
              className="rounded-xl"
            />
          </div>

          {existing.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Excepciones guardadas</Label>
              {existing.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-xl bg-gray-50 px-2.5 py-2 text-xs dark:bg-gray-900"
                >
                  <span className="text-gray-600 dark:text-gray-300">
                    {item.type === "skip_day"
                      ? "Día saltado"
                      : item.type === "modify_time"
                        ? `Hora ${item.times?.[0] ?? "—"}`
                        : `Dosis ${item.dose ?? "—"}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(item.id)}
                    className="text-gray-400 hover:text-rose-600"
                    aria-label="Quitar excepción"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="rounded-xl text-xs"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            className="rounded-xl text-xs bg-rose-600 hover:bg-rose-700 text-white"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy && <Loader2 className="size-3.5 mr-1 animate-spin" />}
            Guardar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
