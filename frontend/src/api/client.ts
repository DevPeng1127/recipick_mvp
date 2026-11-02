import axios, { type InternalAxiosRequestConfig } from 'axios'
import type { TokenResponse } from '../types/auth'

// Use the same origin for ordinary requests and refresh (which bypasses interceptors).
const apiBaseURL = (import.meta.env.VITE_API_BASE_URL?.trim() || '/api/v1').replace(/\/+$/, '')

interface AuthRequest extends InternalAxiosRequestConfig {
  _retry?: boolean
  _sessionId?: number
  _tokenVersion?: number
}

interface AuthSession {
  id: number
  accessToken: string | null
  refreshToken: string | null
  tokenVersion: number
  refreshPromise: Promise<void> | null
}

let sessionId = 0
let activeSession: AuthSession | undefined

function getSession(): AuthSession {
  const accessToken = localStorage.getItem('access_token')
  const refreshToken = localStorage.getItem('refresh_token')
  // Login/logout changes storage outside this client. A stale request must not
  // replace that session's tokens or retry with another user's credentials.
  if (!activeSession || activeSession.accessToken !== accessToken || activeSession.refreshToken !== refreshToken) {
    activeSession = { id: ++sessionId, accessToken, refreshToken, tokenVersion: 0, refreshPromise: null }
  }
  return activeSession
}

function endSession(session: AuthSession) {
  if (getSession() !== session) return
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  // Invalidate even a session with no tokens, so concurrent failures redirect once.
  activeSession = undefined
  window.location.href = '/login'
}

function refreshSession(session: AuthSession): Promise<void> {
  if (!session.refreshPromise) {
    session.refreshPromise = (async () => {
      try {
        // Use bare axios so a refresh failure cannot enter this interceptor again.
        const { data } = await axios.post<TokenResponse>(`${apiBaseURL}/auth/refresh`, {
          refresh_token: session.refreshToken,
        }, { timeout: 30_000 })
        if (getSession() !== session) throw new axios.CanceledError('Authentication session changed')
        if (typeof data?.access_token !== 'string' || !data.access_token.trim()
          || typeof data?.refresh_token !== 'string' || !data.refresh_token.trim()) {
          throw new Error('Invalid token refresh response')
        }
        localStorage.setItem('access_token', data.access_token)
        localStorage.setItem('refresh_token', data.refresh_token)
        session.accessToken = data.access_token
        session.refreshToken = data.refresh_token
        // A refresh may return identical token strings. Track completed refreshes
        // separately so late 401 responses still reuse the completed refresh.
        session.tokenVersion++
      } catch (error) {
        endSession(session)
        throw error
      } finally {
        session.refreshPromise = null
      }
    })()
  }
  return session.refreshPromise
}

const client = axios.create({
  baseURL: apiBaseURL,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config: AuthRequest) => {
  const session = getSession()
  if (config._retry && config._sessionId !== session.id) {
    throw new axios.CanceledError('Authentication session changed')
  }
  config._sessionId = session.id
  config._tokenVersion = session.tokenVersion
  if (session.accessToken) config.headers.Authorization = `Bearer ${session.accessToken}`
  else config.headers.delete('Authorization')
  return config
})

client.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) throw error
    const originalRequest = error.config as AuthRequest
    const session = getSession()
    if (originalRequest._sessionId !== session.id) throw error
    if (originalRequest._retry) {
      if (!session.refreshPromise && originalRequest._tokenVersion === session.tokenVersion) endSession(session)
      throw error
    }
    if (!session.refreshToken || originalRequest.url === '/auth/refresh') {
      endSession(session)
      throw error
    }
    originalRequest._retry = true
    if (session.refreshPromise || originalRequest._tokenVersion === session.tokenVersion) {
      try {
        await refreshSession(session)
      } catch {
        throw error
      }
    }
    if (getSession() !== session) throw error
    return client(originalRequest)
  }
)

export default client
