import type { LoginUrlResponse, TokenResponse } from '../types/auth'
import client from './client'

export const getLoginUrl = async (provider: string): Promise<LoginUrlResponse> => {
  const { data } = await client.get<LoginUrlResponse>(`/auth/${provider}/login-url`)
  return data
}

export const oauthCallback = async (
  provider: string,
  code: string
): Promise<TokenResponse> => {
  const { data } = await client.post<TokenResponse>(`/auth/${provider}/callback`, {
    code,
  })
  return data
}

export const refreshToken = async (refresh_token: string): Promise<TokenResponse> => {
  const { data } = await client.post<TokenResponse>('/auth/refresh', {
    refresh_token,
  })
  return data
}
