import { create } from 'zustand'
import {
  createRefrigerator,
  deleteRefrigerator,
  getRefrigerator,
  listRefrigerators,
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
      refrigerators: [...state.refrigerators, created],
    }))
  },

  editRefrigerator: async (id: number, name: string) => {
    const updated = await updateRefrigerator(id, { name })
    set((state) => ({
      refrigerators: state.refrigerators.map((r) => (r.id === id ? updated : r)),
    }))
  },

  removeRefrigerator: async (id: number) => {
    await deleteRefrigerator(id)
    set((state) => ({
      refrigerators: state.refrigerators.filter((r) => r.id !== id),
    }))
  },
}))
