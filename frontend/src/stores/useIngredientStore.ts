import { create } from 'zustand'
import {
  consumeIngredient,
  createIngredient,
  disposeIngredient,
  listIngredientsByRefrigerator,
  listIngredientsByStorageBox,
  updateIngredient,
} from '../api/ingredients'
import type { ConsumeDisposeRequest, Ingredient, IngredientCreate, IngredientUpdate } from '../types/ingredient'

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
  consumeIngredient: (
    storageBoxId: number,
    ingredientId: number,
    data?: ConsumeDisposeRequest
  ) => Promise<void>
  disposeIngredient: (
    storageBoxId: number,
    ingredientId: number,
    data?: ConsumeDisposeRequest
  ) => Promise<void>
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

  consumeIngredient: async (
    storageBoxId: number,
    ingredientId: number,
    data?: ConsumeDisposeRequest
  ) => {
    const result = await consumeIngredient(storageBoxId, ingredientId, data)
    set((state) => ({
      ingredients: result === null
        ? state.ingredients.filter((i) => i.id !== ingredientId)
        : state.ingredients.map((i) => (i.id === ingredientId ? result : i)),
    }))
  },

  disposeIngredient: async (
    storageBoxId: number,
    ingredientId: number,
    data?: ConsumeDisposeRequest
  ) => {
    const result = await disposeIngredient(storageBoxId, ingredientId, data)
    set((state) => ({
      ingredients: result === null
        ? state.ingredients.filter((i) => i.id !== ingredientId)
        : state.ingredients.map((i) => (i.id === ingredientId ? result : i)),
    }))
  },
}))
