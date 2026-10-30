import type { CookingCommit, CookingPreview, CookingResult, MenuInventory, RecipeResponse } from '../types/recipe'
import client from './client'

export const recommendRecipe = async (
  refrigeratorIds: number[], servings = 1, priorityIngredientIds: number[] = []
): Promise<RecipeResponse> => {
  const { data } = await client.post<RecipeResponse>('/recipes/recommend', {
    refrigerator_ids: refrigeratorIds,
    servings,
    priority_ingredient_ids: priorityIngredientIds,
  })
  return data
}

export const getMenuInventory = async (ids: number[], signal?: AbortSignal): Promise<MenuInventory> => {
  const query = new URLSearchParams(ids.map(id => ['refrigerator_ids', String(id)]))
  return (await client.get<MenuInventory>(`/recipes/ingredients?${query}`, { signal })).data
}

export const getCookingPreview = async (id: string): Promise<CookingPreview> =>
  (await client.get<CookingPreview>(`/recipes/${id}/cooking`)).data

export const consumeRecipe = async (id: string, body: CookingCommit): Promise<CookingResult> =>
  (await client.post<CookingResult>(`/recipes/${id}/consume`, body)).data

export const repeatRecipe = async (id: string): Promise<RecipeResponse> =>
  (await client.post<RecipeResponse>(`/recipes/${id}/repeat`)).data
