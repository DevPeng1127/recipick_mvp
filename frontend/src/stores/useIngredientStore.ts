import { create } from 'zustand'
import {
  bulkIngredientAction,
  consumeIngredient,
  createIngredient,
  deleteIngredient,
  disposeIngredient,
  listIngredientsByRefrigerator,
  listIngredientsByStorageBox,
  updateIngredient,
} from '../api/ingredients'
import type { BulkIngredientActionRequest, ConsumeDisposeRequest, Ingredient, IngredientCreate, IngredientUpdate } from '../types/ingredient'

interface IngredientState {
  ingredients: Ingredient[]
  isLoading: boolean
  error: string | null
  fetchByStorageBox: (storageBoxId: number) => Promise<void>
  fetchByRefrigerator: (refrigeratorId: number) => Promise<void>
  addIngredient: (storageBoxId: number, data: IngredientCreate) => Promise<void>
  removeIngredient: (storageBoxId: number, ingredientId: number) => Promise<void>
  bulkAction: (storageBoxId: number, data: BulkIngredientActionRequest) => Promise<void>
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

  removeIngredient: async (storageBoxId: number, ingredientId: number) => {
    await deleteIngredient(storageBoxId, ingredientId)
    set(state => ({ ingredients: state.ingredients.filter(item => item.id !== ingredientId) }))
  },

  bulkAction: async (storageBoxId, data) => {
    await bulkIngredientAction(storageBoxId, data)
    const removed = new Set(data.items.map(item => item.id))
    set(state => ({ ingredients: state.ingredients.filter(item => !removed.has(item.id)) }))
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
