"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, X, Plus } from "lucide-react";

interface SubCategorySelectorProps {
  /** Available subcategory names to show as tag buttons */
  availableSubCategories: string[];
  /** Currently selected subcategory value */
  value: string;
  /** Callback when subcategory changes */
  onChange: (value: string) => void;
  /** Whether to show the whole component */
  visible?: boolean;
  /** Placeholder for the free-text input (default: "Sin subcategoría") */
  placeholder?: string;
  /** Active tag color scheme (default: "emerald") */
  colorScheme?: "emerald" | "rose" | "blue";
  /** Whether to reset internal state when key changes (e.g., category changes) */
  resetKey?: string;
}

const colorSchemes = {
  emerald: {
    active: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300",
  },
  rose: {
    active: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-300",
  },
  blue: {
    active: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300",
  },
};

export function SubCategorySelector({
  availableSubCategories,
  value,
  onChange,
  visible = true,
  placeholder = "Sin subcategoría",
  colorScheme = "emerald",
  resetKey,
}: SubCategorySelectorProps) {
  const [newSubCategory, setNewSubCategory] = useState("");
  const [showNewSubCategory, setShowNewSubCategory] = useState(false);

  // Reset internal state when resetKey changes (e.g., category changes)
  useEffect(() => {
    setShowNewSubCategory(false);
    setNewSubCategory("");
  }, [resetKey]);

  const handleAddSubCategory = () => {
    if (newSubCategory.trim()) {
      onChange(newSubCategory.trim());
      setShowNewSubCategory(false);
      setNewSubCategory("");
    }
  };

  if (!visible) return null;

  const activeClass = colorSchemes[colorScheme].active;

  return (
    <div className="space-y-2">
      <Label>Subcategoría (opcional)</Label>

      {/* Existing subcategories as tags */}
      {availableSubCategories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {availableSubCategories.map((sub) => (
            <button
              key={sub}
              onClick={() => onChange(sub === value ? "" : sub)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border ${
                sub === value
                  ? activeClass
                  : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      )}

      {/* New subcategory creation or input */}
      {showNewSubCategory ? (
        <div className="flex gap-2">
          <Input
            placeholder="Nueva subcategoría..."
            value={newSubCategory}
            onChange={(e) => setNewSubCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddSubCategory();
            }}
            className="rounded-xl flex-1 text-sm h-9"
            autoFocus
          />
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl h-9"
            onClick={handleAddSubCategory}
            disabled={!newSubCategory.trim()}
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl h-9"
            onClick={() => {
              setShowNewSubCategory(false);
              setNewSubCategory("");
            }}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            placeholder={value || placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-xl flex-1 text-sm h-9"
          />
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl h-9 text-xs gap-1"
            onClick={() => setShowNewSubCategory(true)}
          >
            <Plus className="size-3" />
            Nueva
          </Button>
        </div>
      )}
    </div>
  );
}
