import type { CookingCommit, CookingPreview, CookingResult, RecipeResponse } from '../types/recipe'
import client from './client'

export const recommendRecipe = async (
  refrigeratorIds: number[], servings = 1
): Promise<RecipeResponse> => {
  const { data } = await client.post<RecipeResponse>('/recipes/recommend', {
    refrigerator_ids: refrigeratorIds,
    servings,
  })
  return data
}

export const getCookingPreview = async (id: string): Promise<CookingPreview> =>
  (await client.get<CookingPreview>(`/recipes/${id}/cooking`)).data

export const consumeRecipe = async (id: string, body: CookingCommit): Promise<CookingResult> =>
  (await client.post<CookingResult>(`/recipes/${id}/consume`, body)).data

export const repeatRecipe = async (id: string): Promise<RecipeResponse> =>
  (await client.post<RecipeResponse>(`/recipes/${id}/repeat`)).data
