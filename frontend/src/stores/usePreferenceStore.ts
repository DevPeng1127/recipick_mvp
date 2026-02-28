import { create } from 'zustand'
import {
  getMyPreference,
  updateMyPreference,
  type UserPreference,
  type UserPreferenceUpdate,
} from '../api/users'

interface PreferenceState {
  preference: UserPreference | null
  isLoading: boolean
  error: string | null
  fetchPreference: () => Promise<void>
  savePreference: (data: UserPreferenceUpdate) => Promise<void>
}

export const usePreferenceStore = create<PreferenceState>((set) => ({
  preference: null,
  isLoading: false,
  error: null,

  fetchPreference: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = await getMyPreference()
      set({ preference: data, isLoading: false })
    } catch {
      set({ error: '선호 설정을 불러오지 못했습니다.', isLoading: false })
    }
  },

  savePreference: async (data: UserPreferenceUpdate) => {
    set({ isLoading: true, error: null })
    try {
      const updated = await updateMyPreference(data)
      set({ preference: updated, isLoading: false })
    } catch {
      set({ error: '선호 설정 저장에 실패했습니다.', isLoading: false })
    }
  },
}))
