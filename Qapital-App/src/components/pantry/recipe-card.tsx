"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Users,
  Heart,
  ChefHat,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Ingredient as BaseIngredient, Recipe as BaseRecipe } from "@/lib/types";

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

interface RecipeCardProps {
  recipe: Recipe;
  onCook: () => void;
  onFavorite: () => void;
  isFavorite: boolean;
}

const difficultyColors: Record<string, string> = {
  fácil: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  moderada: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  difícil: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function RecipeCard({ recipe, onCook, onFavorite, isFavorite }: RecipeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [cooking, setCooking] = useState(false);

  const inPantryCount = recipe.ingredients.filter((i) => i.inPantry).length;
  const missingCount = recipe.ingredients.length - inPantryCount;

  const handleCook = async () => {
    setCooking(true);
    try {
      await onCook();
    } catch (error) {
      console.error("Error cooking recipe:", error);
    } finally {
      setCooking(false);
    }
  };

  return (
    <Card className="border-0 shadow-md rounded-2xl bg-white dark:bg-gray-800 overflow-hidden">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">
              {recipe.name}
            </h3>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {recipe.cookingTime} min
              </span>
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {recipe.servings} porciones
              </span>
            </div>
          </div>
          <button
            onClick={onFavorite}
            className="size-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Heart
              className={`size-4 ${
                isFavorite ? "text-red-500 fill-red-500" : "text-gray-300"
              }`}
            />
          </button>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Badge
            className={`text-[10px] ${
              difficultyColors[recipe.difficulty] || difficultyColors.fácil
            }`}
          >
            {recipe.difficulty}
          </Badge>
          {recipe.compatible && (
            <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <Check className="size-3 mr-0.5" />
              Compatible
            </Badge>
          )}
          {!recipe.compatible && (
            <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              <AlertCircle className="size-3 mr-0.5" />
              Restringido
            </Badge>
          )}
        </div>

        {/* Ingredient tags */}
        <div className="flex gap-1.5 flex-wrap mb-3">
          {recipe.ingredients.map((ingredient) => (
            <span
              key={ingredient.name}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                ingredient.inPantry
                  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
              }`}
            >
              {ingredient.inPantry ? (
                <Check className="size-2.5" />
              ) : (
                <AlertCircle className="size-2.5" />
              )}
              {ingredient.name}
            </span>
          ))}
        </div>

        {/* Summary */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-green-600 font-medium">
            {inPantryCount} en despensa
          </span>
          {missingCount > 0 && (
            <span className="text-[10px] text-red-500 font-medium">
              {missingCount} faltante{missingCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" />
              Ocultar instrucciones
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              Ver instrucciones
            </>
          )}
        </button>

        {/* Expanded content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-3">
                {/* Ingredients list */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-900 dark:text-white mb-1">
                    Ingredientes
                  </h4>
                  <ul className="space-y-1">
                    {recipe.ingredients.map((ing) => (
                      <li
                        key={ing.name}
                        className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2"
                      >
                        <span
                          className={`size-1.5 rounded-full ${
                            ing.inPantry ? "bg-green-500" : "bg-red-500"
                          }`}
                        />
                        {ing.quantity} {ing.name}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Instructions */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-900 dark:text-white mb-1">
                    Preparación
                  </h4>
                  <ol className="space-y-1">
                    {recipe.instructions.map((step, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-gray-600 dark:text-gray-400 flex gap-2"
                      >
                        <span className="size-4 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center justify-center text-[9px] font-bold shrink-0">
                          {idx + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cook button */}
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <Button
            onClick={handleCook}
            disabled={cooking}
            className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 h-9 text-xs"
          >
            {cooking ? (
              <span>Descontando ingredientes...</span>
            ) : (
              <>
                <ChefHat className="size-3.5 mr-1" />
                Cocinar
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
