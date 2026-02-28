import type { RecipeResponse } from '../types/recipe'
import client from './client'

export const recommendRecipe = async (
  refrigeratorId: number
): Promise<RecipeResponse> => {
  const { data } = await client.post<RecipeResponse>('/recipes/recommend', {
    refrigerator_id: refrigeratorId,
  })
  return data
}
