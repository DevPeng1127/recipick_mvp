import { create } from 'zustand'
import { oauthCallback } from '../api/auth'
import { getMe, type UserResponse } from '../api/users'

interface AuthState {
  user: UserResponse | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (provider: string, code: string) => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
  initialize: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  isLoading: false,

  login: async (provider: string, code: string) => {
    const tokens = await oauthCallback(provider, code)
    localStorage.setItem('access_token', tokens.access_token)
    localStorage.setItem('refresh_token', tokens.refresh_token)
    const user = await getMe()
    set({ user, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null, isAuthenticated: false })
  },

  fetchUser: async () => {
    try {
      const user = await getMe()
      set({ user, isAuthenticated: true })
    } catch {
      set({ user: null, isAuthenticated: false })
    }
  },

  initialize: async () => {
    const token = localStorage.getItem('access_token')
    if (token) {
      set({ isLoading: true })
      try {
        const user = await getMe()
        set({ user, isAuthenticated: true, isLoading: false })
      } catch {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        set({ user: null, isAuthenticated: false, isLoading: false })
      }
    }
  },
}))
