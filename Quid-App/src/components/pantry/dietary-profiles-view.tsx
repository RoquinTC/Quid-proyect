"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HeartPulse,
  Plus,
  X,
  Loader2,
  ShieldAlert,
  Ban,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import type { HealthProfile } from "@/lib/types";

interface DietaryData {
  conditions: { id: string; name: string }[];
  restrictions: string[];
  preferences: string[];
  avoid: string[];
}

/** Sugerencias rápidas: lo que la gente suele necesitar. */
const CONDITION_SUGGESTIONS = [
  "Diabetes tipo 2",
  "Hipertensión",
  "Colesterol alto",
  "Gastritis",
  "Artritis",
  "Hipotiroidismo",
];
const RESTRICTION_SUGGESTIONS = ["Lactosa", "Gluten", "Maní", "Mariscos", "Huevo", "Azúcar"];

/**
 * **Perfiles alimenticios**.
 *
 * Un perfil de salud (propietario o invitado) con sus tres niveles:
 *  - Condiciones (diagnósticos) → de aquí sale la restricción.
 *  - Restricciones duras: se **bloquean** en recetas y listas.
 *  - Evitar: lo que el usuario no quiere ver, gana sobre todo.
 *
 * Las recetas leen esto para filtrar ingredientes.
 */
export function DietaryProfilesView() {
  const [profiles, setProfiles] = useState<HealthProfile[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [data, setData] = useState<DietaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [conditionDraft, setConditionDraft] = useState("");
  const [restrictionDraft, setRestrictionDraft] = useState("");
  const [avoidDraft, setAvoidDraft] = useState("");

  const fetchProfiles = useCallback(async () => {
    try {
      const list = await apiFetch<HealthProfile[]>("/api/health-profiles");
      setProfiles(list);
      if (list.length > 0) {
        setSelected((prev) => prev || list[0].id);
      }
    } catch (e) {
      console.error("Error fetching profiles:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDietary = useCallback(async (profileId: string) => {
    try {
      const d = await apiFetch<DietaryData>(`/api/pantry/profiles/${profileId}/dietary`);
      setData(d);
    } catch (e) {
      console.error("Error fetching dietary:", e);
      setData(null);
    }
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);
  useEffect(() => {
    if (selected) fetchDietary(selected);
  }, [selected, fetchDietary]);

  const persist = async (next: DietaryData) => {
    if (!selected) return;
    setSaving(true);
    try {
      await apiFetch(`/api/pantry/profiles/${selected}/dietary`, {
        method: "PUT",
        body: JSON.stringify({
          conditions: next.conditions.map((c) => c.name),
          restrictions: next.restrictions,
          preferences: next.preferences,
          avoid: next.avoid,
        }),
      });
      setData(next);
      toast.success("Perfil actualizado");
      // Las condiciones se recrean con id nuevo: se relee del servidor.
      fetchDietary(selected);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const addCondition = () => {
    if (!data || !conditionDraft.trim()) return;
    const next = {
      ...data,
      conditions: [
        ...data.conditions,
        { id: `tmp-${Date.now()}`, name: conditionDraft.trim() },
      ],
    };
    setConditionDraft("");
    persist(next);
  };

  const addToList = (key: "restrictions" | "avoid", value: string) => {
    if (!data || !value.trim()) return;
    if (data[key].includes(value.trim())) return;
    persist({ ...data, [key]: [...data[key], value.trim()] });
  };

  const removeFrom = (key: "restrictions" | "avoid", value: string) => {
    if (!data) return;
    persist({ ...data, [key]: data[key].filter((v) => v !== value) });
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        <div className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="p-4">
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-gray-800">
          <HeartPulse className="mx-auto mb-2 size-8 text-gray-300" />
          <p className="text-[12.5px] font-semibold text-gray-900 dark:text-white">
            Primero crea un perfil
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            Cada perfil (tú o un invitado) puede tener sus propias restricciones alimenticias.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 p-4 pb-safe">
      <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
        <div className="mb-1.5 flex items-center gap-1.5">
          <HeartPulse className="size-3.5 text-rose-500" />
          <p className="text-[12.5px] font-semibold text-gray-900 dark:text-white">
            Perfil alimenticio
          </p>
        </div>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="h-9 rounded-lg text-[12px]">
            <SelectValue placeholder="Elige un perfil" />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} {p.type === "owner" ? "(tú)" : "(invitado)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-[10px] leading-tight text-gray-400">
          Las recetas y las listas de compras respetan esto: lo que marques aquí se evita.
        </p>
      </div>

      {/* Condiciones */}
      <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
        <p className="mb-1.5 text-[11.5px] font-semibold text-gray-900 dark:text-white">
          Condiciones de salud
        </p>
        <div className="mb-2 flex flex-wrap gap-1">
          {(data?.conditions ?? []).length === 0 ? (
            <span className="text-[10.5px] text-gray-400">Ninguna registrada.</span>
          ) : (
            (data?.conditions ?? []).map((c) => (
              <span
                key={c.id}
                className="flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-medium text-rose-600 dark:bg-rose-950/30 dark:text-rose-400"
              >
                {c.name}
                <button
                  onClick={() => data && persist({ ...data, conditions: data.conditions.filter((x) => x.id !== c.id) })}
                  className="text-rose-400 hover:text-rose-600"
                  aria-label={`Quitar ${c.name}`}
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex gap-1.5">
          <Input
            value={conditionDraft}
            onChange={(e) => setConditionDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCondition()}
            placeholder="Agregar condición"
            className="h-8 rounded-lg text-[12px]"
          />
          <Button onClick={addCondition} size="sm" className="h-8 rounded-lg" aria-label="Agregar condición">
            <Plus className="size-3.5" />
          </Button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {CONDITION_SUGGESTIONS.filter(
            (s) => !(data?.conditions ?? []).some((c) => c.name === s)
          ).map((s) => (
            <button
              key={s}
              onClick={() => data && persist({ ...data, conditions: [...data.conditions, { id: `tmp-${s}`, name: s }] })}
              className="rounded-full border border-gray-200 px-2 py-0.5 text-[9.5px] text-gray-500 hover:border-rose-300 hover:text-rose-600 dark:border-gray-700"
            >
              + {s}
            </button>
          ))}
        </div>
      </div>

      {/* Restricciones duras */}
      <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
        <div className="mb-1 flex items-center gap-1.5">
          <ShieldAlert className="size-3 text-red-500" />
          <p className="text-[11.5px] font-semibold text-gray-900 dark:text-white">
            Restricciones (bloquean)
          </p>
        </div>
        <p className="mb-1.5 text-[10px] text-gray-400">
          Alergias e intolerancias: la receta se descarta si las contiene.
        </p>
        <div className="mb-2 flex flex-wrap gap-1">
          {(data?.restrictions ?? []).length === 0 ? (
            <span className="text-[10.5px] text-gray-400">Ninguna.</span>
          ) : (
            (data?.restrictions ?? []).map((r) => (
              <span
                key={r}
                className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-medium text-red-600 dark:bg-red-950/30 dark:text-red-400"
              >
                {r}
                <button onClick={() => removeFrom("restrictions", r)} aria-label={`Quitar ${r}`}>
                  <X className="size-2.5" />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex gap-1.5">
          <Input
            value={restrictionDraft}
            onChange={(e) => setRestrictionDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                addToList("restrictions", restrictionDraft);
                setRestrictionDraft("");
              }
            }}
            placeholder="Lactosa, gluten…"
            className="h-8 rounded-lg text-[12px]"
          />
          <Button
            onClick={() => { addToList("restrictions", restrictionDraft); setRestrictionDraft(""); }}
            size="sm"
            className="h-8 rounded-lg"
            aria-label="Agregar restricción"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {RESTRICTION_SUGGESTIONS.filter((s) => !(data?.restrictions ?? []).includes(s)).map((s) => (
            <button
              key={s}
              onClick={() => addToList("restrictions", s)}
              className="rounded-full border border-gray-200 px-2 py-0.5 text-[9.5px] text-gray-500 hover:border-red-300 hover:text-red-600 dark:border-gray-700"
            >
              + {s}
            </button>
          ))}
        </div>
      </div>

      {/* Evitar */}
      <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
        <div className="mb-1 flex items-center gap-1.5">
          <Ban className="size-3 text-amber-500" />
          <p className="text-[11.5px] font-semibold text-gray-900 dark:text-white">
            Evitar siempre
          </p>
        </div>
        <p className="mb-1.5 text-[10px] text-gray-400">
          Lo que no quieres ver ni en recetas ni en sugerencias.
        </p>
        <div className="mb-2 flex flex-wrap gap-1">
          {(data?.avoid ?? []).length === 0 ? (
            <span className="text-[10.5px] text-gray-400">Nada.</span>
          ) : (
            (data?.avoid ?? []).map((a) => (
              <span
                key={a}
                className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
              >
                {a}
                <button onClick={() => removeFrom("avoid", a)} aria-label={`Quitar ${a}`}>
                  <X className="size-2.5" />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex gap-1.5">
          <Input
            value={avoidDraft}
            onChange={(e) => setAvoidDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                addToList("avoid", avoidDraft);
                setAvoidDraft("");
              }
            }}
            placeholder="Cilantro, hígado…"
            className="h-8 rounded-lg text-[12px]"
          />
          <Button
            onClick={() => { addToList("avoid", avoidDraft); setAvoidDraft(""); }}
            size="sm"
            className="h-8 rounded-lg"
            aria-label="Agregar a evitar"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      {saving && (
        <p className="flex items-center justify-center gap-1 text-[10.5px] text-gray-400">
          <Loader2 className="size-3 animate-spin" />
          Guardando…
        </p>
      )}

      <p className="flex items-start gap-1 px-1 text-[9.5px] leading-tight text-gray-400">
        <Info className="mt-0.5 size-2.5 shrink-0" />
        Esto no sustituye consejo médico. Las restricciones duras solo filtran recetas y
        sugerencias de la app.
      </p>
    </div>
  );
}
