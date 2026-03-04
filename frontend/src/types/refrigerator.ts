import type { StorageBox } from './storage'

export type MemberRole = 'OWNER' | 'GUEST'

export interface RefrigeratorMember {
  id: number
  user_id: number
  role: MemberRole
  nickname?: string
}

export interface IngredientBrief {
  name: string
  expiry_date: string | null
}

export interface Refrigerator {
  id: number
  name: string
  created_at: string
  is_favorite: boolean
  top_ingredients: IngredientBrief[]
  total_ingredient_count: number
}

export interface RefrigeratorDetail extends Refrigerator {
  members: RefrigeratorMember[]
  storage_boxes: StorageBox[]
}

export interface RefrigeratorCreate {
  name: string
}

export interface RefrigeratorUpdate {
  name: string
}
