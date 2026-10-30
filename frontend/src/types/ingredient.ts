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

export interface ConsumeDisposeRequest {
  quantity?: number | null
  memo?: string | null
}

export type BulkIngredientAction = 'delete' | 'dispose'
export interface BulkIngredientActionRequest {
  action: BulkIngredientAction
  items: Omit<Ingredient, 'storage_box_id'>[]
  memo?: string | null
}
