// ─── Pantry Entity Types ───
// API response shapes (money = number, dates = string)

export interface PantryItem {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  expirationDate: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  minStock: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShoppingList {
  id: string;
  name: string;
  status: string;
  profileId?: string | null;
  items: ShoppingListItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ShoppingListItem {
  id: string;
  shoppingListId: string;
  name: string;
  quantity: number;
  unit: string;
  estimatedPrice?: number | null;
  actualPrice?: number | null;
  isPurchased: boolean;
  checked: boolean;
  pantryItemId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface HealthProfile {
  id: string;
  name: string;
  type: string;
  diseases: string | null;
  restrictions: string | null;
  aiRestrictions: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// For recipe views
export interface Ingredient {
  name: string;
  quantity: string;
  unit?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  ingredients: Ingredient[];
  instructions?: string[];
  cookingTime?: number;
  servings?: number;
}

export interface FoodRestriction {
  name: string;
  description?: string;
}
