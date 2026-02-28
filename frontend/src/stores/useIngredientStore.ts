import { create } from 'zustand'
import {
  createIngredient,
  deleteIngredient,
  listIngredientsByRefrigerator,
  listIngredientsByStorageBox,
  updateIngredient,
} from '../api/ingredients'
import type { Ingredient, IngredientCreate, IngredientUpdate } from '../types/ingredient'

interface IngredientState {
  ingredients: Ingredient[]
  isLoading: boolean
  error: string | null
  fetchByStorageBox: (storageBoxId: number) => Promise<void>
  fetchByRefrigerator: (refrigeratorId: number) => Promise<void>
  addIngredient: (storageBoxId: number, data: IngredientCreate) => Promise<void>
  editIngredient: (
    storageBoxId: number,
    ingredientId: number,
    data: IngredientUpdate
  ) => Promise<void>
  removeIngredient: (storageBoxId: number, ingredientId: number) => Promise<void>
}

export const useIngredientStore = create<IngredientState>((set) => ({
  ingredients: [],
  isLoading: false,
  error: null,

  fetchByStorageBox: async (storageBoxId: number) => {
    set({ isLoading: true, error: null })
    try {
      const data = await listIngredientsByStorageBox(storageBoxId)
      set({ ingredients: data, isLoading: false })
    } catch {
      set({ error: '식재료 목록을 불러오지 못했습니다.', isLoading: false })
    }
  },

  fetchByRefrigerator: async (refrigeratorId: number) => {
    set({ isLoading: true, error: null })
    try {
      const data = await listIngredientsByRefrigerator(refrigeratorId)
      set({ ingredients: data, isLoading: false })
    } catch {
      set({ error: '식재료 목록을 불러오지 못했습니다.', isLoading: false })
    }
  },

  addIngredient: async (storageBoxId: number, data: IngredientCreate) => {
    const created = await createIngredient(storageBoxId, data)
    set((state) => ({
      ingredients: [...state.ingredients, created],
    }))
  },

  editIngredient: async (
    storageBoxId: number,
    ingredientId: number,
    data: IngredientUpdate
  ) => {
    const updated = await updateIngredient(storageBoxId, ingredientId, data)
    set((state) => ({
      ingredients: state.ingredients.map((i) =>
        i.id === ingredientId ? updated : i
      ),
    }))
  },

  removeIngredient: async (storageBoxId: number, ingredientId: number) => {
    await deleteIngredient(storageBoxId, ingredientId)
    set((state) => ({
      ingredients: state.ingredients.filter((i) => i.id !== ingredientId),
    }))
  },
}))
