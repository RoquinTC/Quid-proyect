"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useDataEvent } from "@/hooks/use-data-event";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChefHat,
  Sparkles,
  Loader2,
  BookmarkPlus,
  Check,
  X,
  Clock,
  Users,
  Flame,
  Trash2,
  Star,
  ShoppingCart,
  Utensils,
  AlertCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { HealthProfile } from "@/lib/types";

interface IngredientStatus {
  name: string;
  quantity: number;
  unit: string;
  isOptional?: boolean;
  pantryItemId: string | null;
  available: number;
  missing: number;
  status: "full" | "partial" | "missing";
}

interface RecipeAvailability {
  ingredients: IngredientStatus[];
  coverage: number;
  canCook: boolean;
  missingCount: number;
}

interface RecipeItem {
  id?: string;
  name: string;
  description?: string | null;
  type?: string | null;
  servings: number;
  cookingTime?: number | null;
  prepTime?: number | null;
  difficulty?: string | null;
  instructions: string[];
  ingredients: { name: string; quantity: number; unit?: string | null; isOptional?: boolean }[];
  availability?: RecipeAvailability;
  source?: string;
  isFavorite?: boolean;
  lastCookedAt?: string | null;
}

const TYPE_OPTIONS = [
  { value: "todos", label: "Todo" },
  { value: "desayuno", label: "Desayuno" },
  { value: "almuerzo", label: "Almuerzo" },
  { value: "cena", label: "Cena" },
  { value: "snack", label: "Snack" },
];

const MODE_LABELS = {
  A: { title: "Solo preparar", hint: "No descuenta nada del inventario" },
  B: { title: "Descontar lo que hay", hint: "Baja solo lo disponible" },
  C: { title: "Cocinar completo", hint: "Descuenta y manda a compras lo que falte" },
} as const;

/**
 * **Recetas**.
 *
 * Flujo: pedir recetas según lo que HAY en la nevera, guardarlas y, al
 * cocinarlas, decidir qué pasa con el stock:
 *
 *  A. Solo preparar → queda el registro de la comida, no toca la nevera.
 *  B. Descontar lo disponible → baja lo que había, sin inventar.
 *  C. Cocinar completo → descuenta y agrega los faltantes a la lista de compras.
 *
 * Cada tarjeta muestra la disponibilidad real (verde = lo tengo, ámbar =
 * parcial, gris = falta) para decidir antes de abrir la receta.
 */
export function RecipesView() {
  const [generated, setGenerated] = useState<RecipeItem[]>([]);
  const [saved, setSaved] = useState<RecipeItem[]>([]);
  const [profiles, setProfiles] = useState<HealthProfile[]>([]);
  const [profileId, setProfileId] = useState("none");
  const [type, setType] = useState("todos");
  const [maxTime, setMaxTime] = useState("0");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [detail, setDetail] = useState<RecipeItem | null>(null);
  const [cookTarget, setCookTarget] = useState<RecipeItem | null>(null);
  const [cookMode, setCookMode] = useState<"A" | "B" | "C">("B");
  const [cookServings, setCookServings] = useState("2");
  const [cooking, setCooking] = useState(false);

  const fetchSaved = useCallback(async () => {
    try {
      const data = await apiFetch<{ recipes: RecipeItem[] }>("/api/pantry/recipes");
      setSaved(data.recipes ?? []);
    } catch (e) {
      console.error("Error fetching recipes:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProfiles = useCallback(async () => {
    try {
      const data = await apiFetch<HealthProfile[]>("/api/health-profiles");
      setProfiles(data);
    } catch (e) {
      console.error("Error fetching profiles:", e);
    }
  }, []);

  useEffect(() => {
    fetchSaved();
    fetchProfiles();
  }, [fetchSaved, fetchProfiles]);
  useDataEvent("pantryItems", fetchSaved);

  const generate = async () => {
    setGenerating(true);
    setNote(null);
    try {
      const data = await apiFetch<{ recipes: RecipeItem[]; source: string; note?: string }>(
        "/api/ai/recipes",
        {
          method: "POST",
          body: JSON.stringify({
            type: type === "todos" ? undefined : type,
            maxTime: Number(maxTime) || undefined,
            servings: 2,
            profileId: profileId === "none" ? undefined : profileId,
          }),
        }
      );
      setGenerated(data.recipes ?? []);
      setSource(data.source);
      setNote(data.note ?? null);
      if ((data.recipes ?? []).length === 0) toast.info("No salieron recetas. Prueba otro filtro.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron generar recetas");
    } finally {
      setGenerating(false);
    }
  };

  const payloadOf = (recipe: RecipeItem) => ({
    name: recipe.name,
    description: recipe.description,
    type: recipe.type,
    servings: recipe.servings,
    cookingTime: recipe.cookingTime,
    difficulty: recipe.difficulty,
    instructions: recipe.instructions,
    ingredients: recipe.ingredients,
    source: recipe.source,
  });

  const save = async (recipe: RecipeItem) => {
    try {
      await apiFetch("/api/pantry/recipes", { method: "POST", body: JSON.stringify(payloadOf(recipe)) });
      toast.success("Receta guardada");
      fetchSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };

  const remove = async (recipe: RecipeItem) => {
    if (!recipe.id) return;
    try {
      await apiFetch(`/api/pantry/recipes/${recipe.id}`, { method: "DELETE" });
      toast.success("Receta eliminada");
      setDetail(null);
      fetchSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  };

  const toggleFavorite = async (recipe: RecipeItem) => {
    if (!recipe.id) return;
    try {
      await apiFetch(`/api/pantry/recipes/${recipe.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isFavorite: !recipe.isFavorite }),
      });
      fetchSaved();
    } catch {
      toast.error("No se pudo actualizar");
    }
  };

  const openCook = (recipe: RecipeItem) => {
    setCookTarget(recipe);
    setCookServings(String(recipe.servings || 2));
    setCookMode(recipe.availability?.canCook ? "B" : "C");
  };

  const ensureSaved = async (recipe: RecipeItem): Promise<string | null> => {
    if (recipe.id) return recipe.id;
    try {
      const created = await apiFetch<{ id: string }>("/api/pantry/recipes", {
        method: "POST",
        body: JSON.stringify(payloadOf(recipe)),
      });
      fetchSaved();
      return created.id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar la receta");
      return null;
    }
  };

  const doCook = async () => {
    if (!cookTarget) return;
    const recipeId = await ensureSaved(cookTarget);
    if (!recipeId) return;

    setCooking(true);
    try {
      const res = await apiFetch<{ message: string; shoppingListId?: string }>(
        `/api/pantry/recipes/${recipeId}/cook`,
        {
          method: "POST",
          body: JSON.stringify({
            mode: cookMode,
            servings: Number(cookServings) || cookTarget.servings,
          }),
        }
      );
      toast.success(res.message);
      setCookTarget(null);
      setDetail(null);
      fetchSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cocinar");
    } finally {
      setCooking(false);
    }
  };

  /** Manda a una lista de compras lo que falta, sin cocinar todavía. */
  const addMissingToList = async (recipe: RecipeItem) => {
    const missing = recipe.availability?.ingredients.filter(
      (i) => i.status !== "full" && !i.isOptional
    );
    if (!missing || missing.length === 0) {
      toast.info("No falta nada para esta receta");
      return;
    }
    try {
      const lists = await apiFetch<{ lists: { id: string; name: string; status: string }[] }>(
        "/api/shopping-lists"
      );
      const active = lists.lists?.find((l) => l.status !== "completed");
      let listId = active?.id;
      let listName = active?.name;
      if (!listId) {
        const created = await apiFetch<{ id: string; name: string }>("/api/shopping-lists", {
          method: "POST",
          body: JSON.stringify({ name: `Compras para ${recipe.name}` }),
        });
        listId = created.id;
        listName = created.name;
      }

      for (const item of missing) {
        await apiFetch(`/api/shopping-lists/${listId}/items`, {
          method: "POST",
          body: JSON.stringify({
            name: item.name,
            quantity: item.missing,
            unit: item.unit,
            isStock: true,
          }),
        });
      }
      toast.success(`${missing.length} ingrediente(s) agregados a ${listName ?? "la lista"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar a la lista");
    }
  };

  const renderRecipe = (recipe: RecipeItem, index: number, isSaved: boolean) => {
    const availability = recipe.availability;
    return (
      <motion.div
        key={`${recipe.name}-${index}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.04, 0.2) }}
        className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800"
      >
        <button onClick={() => setDetail(recipe)} className="w-full px-3 py-2.5 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-white">
                {recipe.name}
              </p>
              {recipe.description && (
                <p className="truncate text-[10.5px] text-gray-400">{recipe.description}</p>
              )}
            </div>
            {availability && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${
                  availability.canCook
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : availability.coverage > 0
                      ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                }`}
              >
                {availability.canCook ? "Puedes cocinar" : `Faltan ${availability.missingCount}`}
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-2.5 text-[10px] text-gray-400">
            {recipe.cookingTime && (
              <span className="flex items-center gap-0.5">
                <Clock className="size-2.5" />
                {recipe.cookingTime} min
              </span>
            )}
            <span className="flex items-center gap-0.5">
              <Users className="size-2.5" />
              {recipe.servings}
            </span>
            {recipe.difficulty && (
              <span className="flex items-center gap-0.5">
                <Flame className="size-2.5" />
                {recipe.difficulty}
              </span>
            )}
            {recipe.ingredients.length > 0 && <span>{recipe.ingredients.length} ingr.</span>}
          </div>
        </button>

        <div className="flex gap-1.5 border-t border-gray-50 px-2 py-1.5 dark:border-gray-700/50">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openCook(recipe)}
            className="h-7 flex-1 rounded-lg text-[11px]"
          >
            <Utensils className="size-3" />
            Cocinar
          </Button>
          {isSaved ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleFavorite(recipe)}
                className={`h-7 rounded-lg text-[11px] ${recipe.isFavorite ? "text-amber-500" : ""}`}
                aria-label="Favorita"
              >
                <Star className={`size-3 ${recipe.isFavorite ? "fill-amber-500" : ""}`} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => remove(recipe)}
                className="h-7 rounded-lg text-[11px] text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                aria-label="Eliminar"
              >
                <Trash2 className="size-3" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => save(recipe)}
              className="h-7 rounded-lg text-[11px]"
            >
              <BookmarkPlus className="size-3" />
              Guardar
            </Button>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 p-4 pb-safe">
      <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-cyan-500" />
          <p className="text-[12.5px] font-semibold text-gray-900 dark:text-white">
            Qué puedo cocinar
          </p>
        </div>
        <p className="mb-2 mt-0.5 text-[10.5px] text-gray-400">
          Se basa en lo que hay en tu nevera ahora mismo.
        </p>

        <div className="flex gap-1.5">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 flex-1 rounded-lg text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={maxTime} onValueChange={setMaxTime}>
            <SelectTrigger className="h-8 w-[92px] rounded-lg text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Sin límite</SelectItem>
              <SelectItem value="15">15 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="60">1 hora</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {profiles.length > 0 && (
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger className="mt-1.5 h-8 w-full rounded-lg text-[11.5px]">
              <SelectValue placeholder="Sin perfil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin perfil alimenticio</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          onClick={generate}
          disabled={generating}
          className="mt-2 h-9 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 text-[12.5px] font-semibold"
        >
          {generating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <ChefHat className="size-4" />
              Pedir recetas
            </>
          )}
        </Button>

        {note && (
          <p className="mt-1.5 flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
            <AlertCircle className="mt-0.5 size-2.5 shrink-0" />
            {note}
          </p>
        )}
        {source === "ai" && !note && (
          <p className="mt-1.5 text-[10px] text-gray-400">Sugeridas por IA.</p>
        )}
      </div>

      {generated.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Sugerencias
          </h3>
          {generated.map((r, i) => renderRecipe(r, i, false))}
        </div>
      )}

      <div className="space-y-1.5">
        <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Guardadas
        </h3>
        {loading ? (
          <div className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        ) : saved.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center shadow-sm dark:bg-gray-800">
            <ChefHat className="mx-auto mb-2 size-8 text-gray-300" />
            <p className="text-[11.5px] text-gray-500">
              Todavía no has guardado recetas. Pide unas y guarda las que te gusten.
            </p>
          </div>
        ) : (
          saved.map((r, i) => renderRecipe(r, i, true))
        )}
      </div>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent side="bottom" className="max-h-[88vh] rounded-t-2xl p-0">
          {detail && (
            <div className="flex max-h-[88vh] flex-col">
              <SheetHeader className="px-4 pb-2 pt-4">
                <SheetTitle className="text-[15px]">{detail.name}</SheetTitle>
                <SheetDescription className="text-[11.5px]">
                  {detail.servings} porciones
                  {detail.cookingTime ? ` · ${detail.cookingTime} min` : ""}
                  {detail.difficulty ? ` · ${detail.difficulty}` : ""}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-4 pb-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Ingredientes
                </p>
                <ul className="overflow-hidden rounded-xl border border-gray-100 dark:border-gray-700">
                  {(detail.availability?.ingredients ?? []).map((ing, i) => (
                    <li
                      key={`${ing.name}-${i}`}
                      className="flex items-center gap-2 border-b border-gray-50 px-3 py-1.5 last:border-0 dark:border-gray-700/50"
                    >
                      <span
                        className={`shrink-0 ${
                          ing.status === "full"
                            ? "text-emerald-500"
                            : ing.status === "partial"
                              ? "text-amber-500"
                              : "text-gray-300"
                        }`}
                      >
                        {ing.status === "full" ? <Check className="size-3" /> : <X className="size-3" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-gray-700 dark:text-gray-300">
                        {ing.name}
                        {ing.isOptional && (
                          <span className="ml-1 text-[9.5px] text-gray-400">(opcional)</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[10.5px] tabular-nums text-gray-500">
                        {ing.quantity} {ing.unit}
                      </span>
                      {ing.status !== "full" && (
                        <span className="shrink-0 text-[9.5px] text-amber-600">
                          falta {ing.missing}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {detail.instructions.length > 0 && (
                  <>
                    <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Preparación
                    </p>
                    <ol className="space-y-1.5">
                      {detail.instructions.map((step, i) => (
                        <li key={i} className="flex gap-2 text-[12px] text-gray-700 dark:text-gray-300">
                          <span className="shrink-0 font-semibold text-cyan-600">{i + 1}.</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>

              <div className="space-y-1.5 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
                <Button
                  onClick={() => addMissingToList(detail)}
                  disabled={detail.availability?.canCook}
                  variant="outline"
                  className="h-9 w-full rounded-xl text-[12px]"
                >
                  <ShoppingCart className="size-3.5" />
                  Agregar faltantes a la lista
                </Button>
                <Button
                  onClick={() => openCook(detail)}
                  className="h-10 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 text-[13px] font-semibold"
                >
                  <Utensils className="size-4" />
                  Cocinar
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!cookTarget} onOpenChange={(o) => !o && setCookTarget(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Cocinar {cookTarget?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
              <span className="text-[12px] text-gray-600 dark:text-gray-300">Porciones</span>
              <input
                type="number"
                min="1"
                value={cookServings}
                onChange={(e) => setCookServings(e.target.value)}
                className="h-7 w-16 rounded-lg border border-gray-200 bg-white text-center text-[12.5px] font-semibold tabular-nums dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              />
            </div>

            {(Object.keys(MODE_LABELS) as Array<keyof typeof MODE_LABELS>).map((mode) => (
              <button
                key={mode}
                onClick={() => setCookMode(mode)}
                className={`flex w-full items-start gap-2 rounded-xl border p-2.5 text-left transition-colors ${
                  cookMode === mode
                    ? "border-cyan-400 bg-cyan-50/60 dark:border-cyan-700 dark:bg-cyan-950/30"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <span
                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                    cookMode === mode ? "border-cyan-500 bg-cyan-500 text-white" : "border-gray-300"
                  }`}
                >
                  {cookMode === mode && <Check className="size-2.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-gray-900 dark:text-white">
                    {MODE_LABELS[mode].title}
                  </span>
                  <span className="block text-[10.5px] text-gray-500">{MODE_LABELS[mode].hint}</span>
                </span>
              </button>
            ))}

            <Button
              onClick={doCook}
              disabled={cooking}
              className="h-10 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 text-[13px] font-semibold"
            >
              {cooking ? <Loader2 className="size-4 animate-spin" /> : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
