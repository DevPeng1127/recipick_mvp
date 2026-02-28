import { create } from 'zustand'
import { recommendRecipe } from '../api/recipes'

interface RecipeState {
  recipe: string
  isLoading: boolean
  error: string | null
  fetchRecipe: (refrigeratorId: number) => Promise<void>
  clearRecipe: () => void
}

export const useRecipeStore = create<RecipeState>((set) => ({
  recipe: '',
  isLoading: false,
  error: null,

  fetchRecipe: async (refrigeratorId: number) => {
    set({ isLoading: true, error: null, recipe: '' })
    try {
      const data = await recommendRecipe(refrigeratorId)
      set({ recipe: data.recipe, isLoading: false })
    } catch {
      set({ error: '레시피 추천에 실패했습니다.', isLoading: false })
    }
  },

  clearRecipe: () => {
    set({ recipe: '', error: null })
  },
}))
