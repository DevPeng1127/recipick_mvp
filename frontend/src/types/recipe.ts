import type { ExpirySource } from './ingredient'
export interface RecipeRecommendRequest {
  refrigerator_ids: number[]
  servings?: number
  priority_ingredient_ids?: number[]
}

export interface MenuIngredient {
  ingredient_id: number
  name: string
  quantity: number
  unit: string
  expiry_date: string | null
  expiry_source: ExpirySource
  refrigerator_id: number
  refrigerator_name: string
  storage_box_name: string
}
export interface MenuInventory { as_of: string; ingredients: MenuIngredient[] }

export interface RecipeResponse {
  recipe: string
  plan_id?: string
}

export interface CookingStock {
  ingredient_id: number
  name: string
  quantity: number
  unit: string
  expiry_date: string | null
  expiry_source?: ExpirySource
  refrigerator_id: number
  refrigerator_name: string
  storage_box_name: string
  token: string
}
export interface CookingResult {
  plan_id: string
  title: string
  items: { ingredient_id: number; name: string; quantity: number; unit: string; remaining_quantity: number }[]
}
export interface CookingPreview {
  plan_id: string
  title: string
  recipe: string
  servings: number
  requirements: { ingredient_name: string; quantity: number | null; unit: string | null }[]
  stock: CookingStock[]
  suggestions: { requirement_index: number; ingredient_id: number | null; quantity: number | null; message: string | null }[]
  applied_at: string | null
  result: CookingResult | null
}
export interface CookingCommit {
  items: { ingredient_id: number; quantity: number; expected_token: string }[]
}
