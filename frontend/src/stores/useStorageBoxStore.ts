import { create } from 'zustand'
import {
  createStorageBox,
  deleteStorageBox,
  listStorageBoxes,
  updateStorageBox,
} from '../api/storageBoxes'
import { reorderStorageBoxes } from '../api/refrigerators'
import type { StorageBox, StorageBoxCreate, StorageBoxUpdate } from '../types/storage'

interface StorageBoxState {
  storageBoxes: StorageBox[]
  isLoading: boolean
  error: string | null
  fetchStorageBoxes: (refrigeratorId: number) => Promise<void>
  addStorageBox: (refrigeratorId: number, data: StorageBoxCreate) => Promise<void>
  editStorageBox: (
    refrigeratorId: number,
    storageBoxId: number,
    data: StorageBoxUpdate
  ) => Promise<void>
  removeStorageBox: (refrigeratorId: number, storageBoxId: number) => Promise<void>
  reorderStorageBoxes: (refrigeratorId: number, orderedIds: number[]) => Promise<void>
}

export const useStorageBoxStore = create<StorageBoxState>((set) => ({
  storageBoxes: [],
  isLoading: false,
  error: null,

  fetchStorageBoxes: async (refrigeratorId: number) => {
    set({ isLoading: true, error: null })
    try {
      const data = await listStorageBoxes(refrigeratorId)
      set({ storageBoxes: data, isLoading: false })
    } catch {
      set({ error: '보관함 목록을 불러오지 못했습니다.', isLoading: false })
    }
  },

  addStorageBox: async (refrigeratorId: number, data: StorageBoxCreate) => {
    const created = await createStorageBox(refrigeratorId, data)
    set((state) => ({
      storageBoxes: [...state.storageBoxes, created],
    }))
  },

  editStorageBox: async (
    refrigeratorId: number,
    storageBoxId: number,
    data: StorageBoxUpdate
  ) => {
    const updated = await updateStorageBox(refrigeratorId, storageBoxId, data)
    set((state) => ({
      storageBoxes: state.storageBoxes.map((sb) =>
        sb.id === storageBoxId ? updated : sb
      ),
    }))
  },

  removeStorageBox: async (refrigeratorId: number, storageBoxId: number) => {
    await deleteStorageBox(refrigeratorId, storageBoxId)
    set((state) => ({
      storageBoxes: state.storageBoxes.filter((sb) => sb.id !== storageBoxId),
    }))
  },

  reorderStorageBoxes: async (refrigeratorId: number, orderedIds: number[]) => {
    set((state) => {
      const map = new Map(state.storageBoxes.map((sb) => [sb.id, sb]))
      return {
        storageBoxes: orderedIds.map((id) => map.get(id)!).filter(Boolean),
      }
    })
    await reorderStorageBoxes(refrigeratorId, orderedIds)
  },
}))
