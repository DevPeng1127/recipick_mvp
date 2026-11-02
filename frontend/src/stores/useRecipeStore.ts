import { create } from 'zustand'
import { isAxiosError } from 'axios'
import { recommendRecipe } from '../api/recipes'

interface RecipeState {
  recipe: string
  planId: string | null
  isLoading: boolean
  error: string | null
  fetchRecipe: (refrigeratorIds: number[], servings?: number, priorityIngredientIds?: number[]) => Promise<void>
  clearRecipe: () => void
}

function recommendationError(error: unknown): string {
  if (isAxiosError(error) && error.response?.status === 502 &&
      error.response.data?.detail?.code === 'inconsistent_menu') {
    return '메뉴 내용의 일관성을 확인하지 못해 결과를 저장하지 않았습니다. 다시 추천받기를 눌러 주세요.'
  }
  if (isAxiosError(error) && error.response?.status === 429) {
    const detail = error.response.data?.detail
    const message = typeof detail?.message === 'string'
      ? detail.message
      : '메뉴 추천 사용 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'
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
  if (isAxiosError(error) && [403, 409].includes(error.response?.status ?? 0)) {
    return error.response?.status === 409
      ? '선택한 재료가 변경되었거나 기한이 지났습니다. 재료 목록을 새로고침하고 다시 선택해 주세요.'
      : '선택한 냉장고에 접근할 수 없습니다. 냉장고 목록을 다시 확인해 주세요.'
  }
  return '메뉴 추천에 실패했습니다.'
}

export const useRecipeStore = create<RecipeState>((set, get) => ({
  recipe: '',
  planId: null,
  isLoading: false,
  error: null,

  fetchRecipe: async (refrigeratorIds: number[], servings = 1, priorityIngredientIds: number[] = []) => {
    if (get().isLoading) return
    set({ isLoading: true, error: null, recipe: '', planId: null })
    try {
      const data = await recommendRecipe(refrigeratorIds, servings, priorityIngredientIds)
      set({ recipe: data.recipe, planId: data.plan_id ?? null, isLoading: false })
    } catch (error) {
      set({ error: recommendationError(error), isLoading: false })
    }
  },

  clearRecipe: () => {
    set({ recipe: '', planId: null, error: null })
  },
}))
