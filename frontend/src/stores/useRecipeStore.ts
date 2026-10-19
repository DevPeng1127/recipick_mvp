import { create } from 'zustand'
import { isAxiosError } from 'axios'
import { recommendRecipe } from '../api/recipes'

interface RecipeState {
  recipe: string
  isLoading: boolean
  error: string | null
  fetchRecipe: (refrigeratorIds: number[]) => Promise<void>
  clearRecipe: () => void
}

function recommendationError(error: unknown): string {
  if (isAxiosError(error) && error.response?.status === 429) {
    const detail = error.response.data?.detail
    const message = typeof detail?.message === 'string'
      ? detail.message
      : '레시피 추천 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'
    if (typeof detail?.retry_at === 'string') {
      const retryAt = new Date(detail.retry_at)
      if (!Number.isNaN(retryAt.getTime())) {
        const time = new Intl.DateTimeFormat('ko-KR', {
          timeZone: 'Asia/Seoul', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(retryAt)
        return `${message} 다시 시도 가능 시간: ${time} (한국 시간)`
      }
    }
    return message
  }
  return '레시피 추천에 실패했습니다.'
}

export const useRecipeStore = create<RecipeState>((set, get) => ({
  recipe: '',
  isLoading: false,
  error: null,

  fetchRecipe: async (refrigeratorIds: number[]) => {
    if (get().isLoading) return
    set({ isLoading: true, error: null, recipe: '' })
    try {
      const data = await recommendRecipe(refrigeratorIds)
      set({ recipe: data.recipe, isLoading: false })
    } catch (error) {
      set({ error: recommendationError(error), isLoading: false })
    }
  },

  clearRecipe: () => {
    set({ recipe: '', error: null })
  },
}))
