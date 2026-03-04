import type { RecipeResponse } from '../types/recipe'
import client from './client'

export const recommendRecipe = async (
  refrigeratorIds: number[]
): Promise<RecipeResponse> => {
  const { data } = await client.post<RecipeResponse>('/recipes/recommend', {
    refrigerator_ids: refrigeratorIds,
  })
  return data
}
