"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
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
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { Loader2, Sparkles, Plus, X, AlertCircle } from "lucide-react";

interface FoodRestriction {
  food: string;
  reason: string;
  level: string;
  relatedDisease: string;
}

interface HealthProfileFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: {
    id: string;
    name: string;
    type: string;
    diseases: string | null;
    restrictions: string | null;
    aiRestrictions: string | null;
  } | null;
  onSuccess?: () => void;
}

const commonDiseases = [
  "Diabetes tipo 2",
  "Hipertensión",
  "Celiaca",
  "Intolerancia a la lactosa",
  "Gota",
  "Colesterol alto",
  "Enfermedad renal",
  "Reflujo gastroesofágico",
  "Alergia a frutos secos",
  "Alergia al marisco",
];

export function HealthProfileForm({ open, onOpenChange, profile, onSuccess }: HealthProfileFormProps) {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [name, setName] = useState(profile?.name || "");
  const [type, setType] = useState(profile?.type || "owner");
  const [diseases, setDiseases] = useState<string[]>([]);
  const [customDisease, setCustomDisease] = useState("");
  const [restrictions, setRestrictions] = useState<FoodRestriction[]>([]);
  const [aiRestrictions, setAiRestrictions] = useState<FoodRestriction[]>([]);
  const [newRestrictionFood, setNewRestrictionFood] = useState("");
  const [newRestrictionReason, setNewRestrictionReason] = useState("");

  const isEditing = !!profile;

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setType(profile.type);
      try {
        setDiseases(profile.diseases ? JSON.parse(profile.diseases) : []);
      } catch { setDiseases([]); }
      try {
        setRestrictions(profile.restrictions ? JSON.parse(profile.restrictions) : []);
      } catch { setRestrictions([]); }
      try {
        setAiRestrictions(profile.aiRestrictions ? JSON.parse(profile.aiRestrictions) : []);
      } catch { setAiRestrictions([]); }
    } else {
      resetForm();
    }
  }, [profile]);

  const resetForm = () => {
    setName("");
    setType("owner");
    setDiseases([]);
    setCustomDisease("");
    setRestrictions([]);
    setAiRestrictions([]);
    setNewRestrictionFood("");
    setNewRestrictionReason("");
  };

  const toggleDisease = (disease: string) => {
    setDiseases((prev) =>
      prev.includes(disease) ? prev.filter((d) => d !== disease) : [...prev, disease]
    );
  };

  const addCustomDisease = () => {
    if (customDisease.trim() && !diseases.includes(customDisease.trim())) {
      setDiseases((prev) => [...prev, customDisease.trim()]);
      setCustomDisease("");
    }
  };

  const addManualRestriction = () => {
    if (newRestrictionFood.trim()) {
      setRestrictions((prev) => [
        ...prev,
        {
          food: newRestrictionFood.trim(),
          reason: newRestrictionReason.trim(),
          level: "evitar",
          relatedDisease: "",
        },
      ]);
      setNewRestrictionFood("");
      setNewRestrictionReason("");
    }
  };

  const removeRestriction = (index: number) => {
    setRestrictions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAnalyzeWithAI = async () => {
    if (diseases.length === 0) return;
    setAnalyzing(true);
    try {
      const data = await apiFetch<{ restrictions: FoodRestriction[]; summary: string }>(
        "/api/ai/food-restrictions",
        {
          method: "POST",
          body: JSON.stringify({ diseases }),
        }
      );
      setAiRestrictions(data.restrictions || []);
    } catch (error) {
      console.error("Error analyzing with AI:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async () => {
    if (!name) return;
    setLoading(true);
    try {
      const data = {
        name,
        type,
        diseases,
        restrictions,
        aiRestrictions,
      };

      if (isEditing) {
        await apiFetch(`/api/health-profiles/${profile.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      } else {
        await apiFetch("/api/health-profiles", {
          method: "POST",
          body: JSON.stringify(data),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Perfil de Salud" : "Nuevo Perfil de Salud"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="profileName">Nombre</Label>
            <Input
              id="profileName"
              placeholder="Ej: Mi perfil, Mamá, etc."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Propietario</SelectItem>
                <SelectItem value="guest">Invitado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Diseases */}
          <div className="space-y-2">
            <Label>Condiciones de salud</Label>
            <div className="flex flex-wrap gap-2">
              {commonDiseases.map((disease) => (
                <button
                  key={disease}
                  onClick={() => toggleDisease(disease)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    diseases.includes(disease)
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-300 dark:border-amber-700"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-transparent"
                  }`}
                >
                  {disease}
                </button>
              ))}
            </div>

            {/* Custom disease */}
            <div className="flex gap-2">
              <Input
                placeholder="Otra condición..."
                value={customDisease}
                onChange={(e) => setCustomDisease(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomDisease()}
                className="rounded-xl h-9 text-sm"
              />
              <Button
                onClick={addCustomDisease}
                variant="outline"
                size="icon"
                className="size-9 rounded-xl shrink-0"
                disabled={!customDisease.trim()}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            {/* Selected diseases */}
            {diseases.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {diseases.map((d) => (
                  <Badge
                    key={d}
                    className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 cursor-pointer"
                    onClick={() => toggleDisease(d)}
                  >
                    {d}
                    <X className="size-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* AI Analysis Button */}
          {diseases.length > 0 && (
            <Button
              onClick={handleAnalyzeWithAI}
              disabled={analyzing}
              variant="outline"
              className="w-full rounded-xl border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
            >
              {analyzing ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="size-4 mr-2" />
              )}
              Analizar con IA
            </Button>
          )}

          {/* AI-generated restrictions */}
          {aiRestrictions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-xs font-medium text-amber-600">
                <Sparkles className="size-3" />
                Restricciones detectadas por IA
              </div>
              {aiRestrictions.map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/10"
                >
                  <AlertCircle className="size-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <span className="text-xs font-medium text-gray-900 dark:text-white">
                      {r.food}
                    </span>
                    {r.reason && (
                      <p className="text-[10px] text-gray-500">{r.reason}</p>
                    )}
                    {r.level && (
                      <Badge className="text-[9px] h-4 mt-0.5 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                        {r.level}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Manual restriction entry */}
          <div className="space-y-2">
            <Label>Agregar restricción manual</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Alimento"
                value={newRestrictionFood}
                onChange={(e) => setNewRestrictionFood(e.target.value)}
                className="rounded-xl h-9 text-sm flex-1"
              />
              <Input
                placeholder="Razón (opcional)"
                value={newRestrictionReason}
                onChange={(e) => setNewRestrictionReason(e.target.value)}
                className="rounded-xl h-9 text-sm flex-1"
              />
              <Button
                onClick={addManualRestriction}
                variant="outline"
                size="icon"
                className="size-9 rounded-xl shrink-0"
                disabled={!newRestrictionFood.trim()}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            {/* Manual restrictions list */}
            {restrictions.length > 0 && (
              <div className="space-y-1 mt-2">
                {restrictions.map((r, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800"
                  >
                    <AlertCircle className="size-3 text-red-400 shrink-0" />
                    <span className="text-xs text-gray-900 dark:text-white flex-1">
                      {r.food}
                      {r.reason && (
                        <span className="text-gray-400"> — {r.reason}</span>
                      )}
                    </span>
                    <button
                      onClick={() => removeRestriction(idx)}
                      className="size-5 rounded flex items-center justify-center text-gray-400 hover:text-red-500"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !name}
            className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            {isEditing ? "Guardar Cambios" : "Crear Perfil"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
