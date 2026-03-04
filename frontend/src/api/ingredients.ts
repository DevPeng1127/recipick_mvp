import type { Ingredient, IngredientCreate, IngredientUpdate } from '../types/ingredient'
import type { StorageType } from '../types/storage'
import client from './client'

export interface IngredientSearchResult {
  ingredient_id: number
  ingredient_name: string
  quantity: number
  unit: string
  expiry_date: string | null
  storage_box_name: string
  storage_box_type: StorageType
  refrigerator_name: string
  refrigerator_id: number
}

export const searchIngredients = async (query: string): Promise<IngredientSearchResult[]> => {
  const { data } = await client.get<IngredientSearchResult[]>('/ingredients/search', {
    params: { q: query },
  })
  return data
}

export const listIngredientsByStorageBox = async (
  storageBoxId: number
): Promise<Ingredient[]> => {
  const { data } = await client.get<Ingredient[]>(
    `/storage-boxes/${storageBoxId}/ingredients`
  )
  return data
}

export const listIngredientsByRefrigerator = async (
  refrigeratorId: number
): Promise<Ingredient[]> => {
  const { data } = await client.get<Ingredient[]>(
    `/refrigerators/${refrigeratorId}/ingredients`
  )
  return data
}

export const createIngredient = async (
  storageBoxId: number,
  body: IngredientCreate
): Promise<Ingredient> => {
  const { data } = await client.post<Ingredient>(
    `/storage-boxes/${storageBoxId}/ingredients`,
    body
  )
  return data
}

export const updateIngredient = async (
  storageBoxId: number,
  ingredientId: number,
  body: IngredientUpdate
): Promise<Ingredient> => {
  const { data } = await client.put<Ingredient>(
    `/storage-boxes/${storageBoxId}/ingredients/${ingredientId}`,
    body
  )
  return data
}

export const deleteIngredient = async (
  storageBoxId: number,
  ingredientId: number
): Promise<void> => {
  await client.delete(`/storage-boxes/${storageBoxId}/ingredients/${ingredientId}`)
}
