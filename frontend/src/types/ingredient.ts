export interface Ingredient {
  id: number
  storage_box_id: number
  name: string
  quantity: number
  unit: string
  expiry_date: string | null
}

export interface IngredientCreate {
  name: string
  quantity: number
  unit?: string
  expiry_date?: string | null
}

export interface IngredientUpdate {
  name?: string
  quantity?: number
  unit?: string
  expiry_date?: string | null
}
