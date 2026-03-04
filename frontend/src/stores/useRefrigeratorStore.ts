import { create } from 'zustand'
import {
  createRefrigerator,
  deleteRefrigerator,
  getRefrigerator,
  listRefrigerators,
  reorderRefrigerators,
  toggleFavorite,
  updateRefrigerator,
} from '../api/refrigerators'
import type { Refrigerator, RefrigeratorDetail } from '../types/refrigerator'

interface RefrigeratorState {
  refrigerators: Refrigerator[]
  currentRefrigerator: RefrigeratorDetail | null
  isLoading: boolean
  error: string | null
  fetchRefrigerators: () => Promise<void>
  fetchRefrigeratorDetail: (id: number) => Promise<void>
  addRefrigerator: (name: string) => Promise<void>
  editRefrigerator: (id: number, name: string) => Promise<void>
  removeRefrigerator: (id: number) => Promise<void>
  toggleFavorite: (id: number) => Promise<void>
  reorderRefrigerators: (orderedIds: number[]) => Promise<void>
}

export const useRefrigeratorStore = create<RefrigeratorState>((set) => ({
  refrigerators: [],
  currentRefrigerator: null,
  isLoading: false,
  error: null,

  fetchRefrigerators: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = await listRefrigerators()
      set({ refrigerators: data, isLoading: false })
    } catch {
      set({ error: '냉장고 목록을 불러오지 못했습니다.', isLoading: false })
    }
  },

  fetchRefrigeratorDetail: async (id: number) => {
    set({ isLoading: true, error: null })
    try {
      const data = await getRefrigerator(id)
      set({ currentRefrigerator: data, isLoading: false })
    } catch {
      set({ error: '냉장고 정보를 불러오지 못했습니다.', isLoading: false })
    }
  },

  addRefrigerator: async (name: string) => {
    const created = await createRefrigerator({ name })
    set((state) => ({
      refrigerators: [...state.refrigerators, { ...created, is_favorite: false, top_ingredients: [], total_ingredient_count: 0 }],
    }))
  },

  editRefrigerator: async (id: number, name: string) => {
    const updated = await updateRefrigerator(id, { name })
    set((state) => ({
      refrigerators: state.refrigerators.map((r) =>
        r.id === id ? { ...r, ...updated } : r
      ),
    }))
  },

  removeRefrigerator: async (id: number) => {
    await deleteRefrigerator(id)
    set((state) => ({
      refrigerators: state.refrigerators.filter((r) => r.id !== id),
    }))
  },

  toggleFavorite: async (id: number) => {
    const { is_favorite } = await toggleFavorite(id)
    set((state) => ({
      refrigerators: state.refrigerators.map((r) =>
        r.id === id ? { ...r, is_favorite } : r
      ),
    }))
  },

  reorderRefrigerators: async (orderedIds: number[]) => {
    set((state) => {
      const map = new Map(state.refrigerators.map((r) => [r.id, r]))
      return {
        refrigerators: orderedIds.map((id) => map.get(id)!).filter(Boolean),
      }
    })
    await reorderRefrigerators(orderedIds)
  },
}))
