"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { RecipeCard } from "./recipe-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ChefHat,
  Sparkles,
  Loader2,
  Clock,
  Users,
  Heart,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Ingredient as BaseIngredient, Recipe as BaseRecipe, HealthProfile } from "@/lib/types";

type Ingredient = BaseIngredient & { inPantry: boolean };
type Recipe = Omit<BaseRecipe, 'id' | 'ingredients' | 'instructions' | 'cookingTime' | 'servings'> & {
  name: string;
  ingredients: Ingredient[];
  instructions: string[];
  cookingTime: number;
  servings: number;
  difficulty: string;
  compatible: boolean;
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function RecipesView() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [useHealthProfile, setUseHealthProfile] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("none");
  const [servings, setServings] = useState("4");
  const [cuisine, setCuisine] = useState("latinoamericana");
  const [healthProfiles, setHealthProfiles] = useState<HealthProfile[]>([]);
  const [favorites, setFavorites] = useState<Recipe[]>([]);

  const fetchProfiles = useCallback(async () => {
    try {
      const data = await apiFetch<HealthProfile[]>("/api/health-profiles");
      setHealthProfiles(data);
    } catch (error) {
      console.error("Error fetching profiles:", error);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const handleGenerateRecipes = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ recipes: Recipe[] }>("/api/ai/recipes", {
        method: "POST",
        body: JSON.stringify({
          profileId: useHealthProfile && selectedProfileId !== "none" ? selectedProfileId : null,
          servings: parseInt(servings),
          cuisine,
        }),
      });
      setRecipes(data.recipes || []);
    } catch (error) {
      console.error("Error generating recipes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCook = async (recipe: Recipe) => {
    // Deduct used ingredients from pantry
    const pantryData = await apiFetch<{ items: { id: string; name: string; quantity: number; unit: string }[] }>("/api/pantry");
    const pantryItems = pantryData.items;

    for (const ingredient of recipe.ingredients) {
      if (ingredient.inPantry) {
        const pantryItem = pantryItems.find(
          (p) => p.name.toLowerCase() === ingredient.name.toLowerCase()
        );
        if (pantryItem) {
          const deductQty = parseFloat(ingredient.quantity) || 1;
          const newQty = Math.max(0, pantryItem.quantity - deductQty);
          await apiFetch(`/api/pantry/${pantryItem.id}`, {
            method: "PUT",
            body: JSON.stringify({ quantity: newQty }),
          });
        }
      }
    }
  };

  const toggleFavorite = (recipe: Recipe) => {
    setFavorites((prev) => {
      const isFav = prev.some((r) => r.name === recipe.name);
      return isFav ? prev.filter((r) => r.name !== recipe.name) : [...prev, recipe];
    });
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-safe"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-amber-600 to-orange-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <ChefHat className="size-4 text-amber-200" />
              <span className="text-sm text-amber-100">Recetas con IA</span>
            </div>
            <p className="text-lg font-bold">Descubre qué cocinar hoy</p>
            <p className="text-xs text-amber-200 mt-1">
              Basado en los ingredientes de tu despensa
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Options */}
      <motion.div variants={itemVariants} className="space-y-3">
        {/* Servings & Cuisine */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Porciones</Label>
            <div className="flex items-center gap-1">
              <Users className="size-3.5 text-gray-400" />
              <Select value={servings} onValueChange={setServings}>
                <SelectTrigger className="rounded-xl h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n} persona{n > 1 ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Cocina</Label>
            <Select value={cuisine} onValueChange={setCuisine}>
              <SelectTrigger className="rounded-xl h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latinoamericana">Latinoamericana</SelectItem>
                <SelectItem value="italiana">Italiana</SelectItem>
                <SelectItem value="asiatica">Asiática</SelectItem>
                <SelectItem value="mediterranea">Mediterránea</SelectItem>
                <SelectItem value="mexicana">Mexicana</SelectItem>
                <SelectItem value="rapida">Rápida y fácil</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Health profile toggle */}
        {healthProfiles.length > 0 && (
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Considerar mi perfil de salud</Label>
              <p className="text-[10px] text-gray-400">
                Filtra recetas según tus restricciones
              </p>
            </div>
            <Switch checked={useHealthProfile} onCheckedChange={setUseHealthProfile} />
          </div>
        )}

        {/* Profile selector */}
        {useHealthProfile && healthProfiles.length > 0 && (
          <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
            <SelectTrigger className="rounded-xl h-9 text-xs">
              <SelectValue placeholder="Seleccionar perfil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin perfil</SelectItem>
              {healthProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </motion.div>

      {/* Generate button */}
      <motion.div variants={itemVariants}>
        <Button
          onClick={handleGenerateRecipes}
          disabled={loading}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 text-base font-semibold shadow-lg shadow-amber-500/25"
        >
          {loading ? (
            <>
              <Loader2 className="size-5 animate-spin mr-2" />
              Generando recetas...
            </>
          ) : (
            <>
              <Sparkles className="size-5 mr-2" />
              Buscar Recetas
            </>
          )}
        </Button>
      </motion.div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      )}

      {/* Recipes */}
      {!loading && recipes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Recetas sugeridas
          </h3>
          <AnimatePresence>
            {recipes.map((recipe, idx) => (
              <motion.div
                key={recipe.name}
                variants={itemVariants}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: idx * 0.1 }}
              >
                <RecipeCard
                  recipe={recipe}
                  onCook={() => handleCook(recipe)}
                  onFavorite={() => toggleFavorite(recipe)}
                  isFavorite={favorites.some((r) => r.name === recipe.name)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Favorites */}
      {!loading && favorites.length > 0 && recipes.length === 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Heart className="size-4 text-red-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Favoritas
            </h3>
          </div>
          {favorites.map((recipe) => (
            <RecipeCard
              key={recipe.name}
              recipe={recipe}
              onCook={() => handleCook(recipe)}
              onFavorite={() => toggleFavorite(recipe)}
              isFavorite={true}
            />
          ))}
        </div>
      )}

      {/* No recipes yet */}
      {!loading && recipes.length === 0 && favorites.length === 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg mb-4">
                <ChefHat className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                ¡A cocinar!
              </h3>
              <p className="text-sm text-gray-500">
                Agrega productos a tu despensa y busca recetas con IA
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
