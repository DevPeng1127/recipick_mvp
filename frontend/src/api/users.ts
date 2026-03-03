import client from './client'

export interface UserResponse {
  id: number
  oauth_provider: string
  nickname: string
}

export type CookingSkill = 'LOW' | 'MEDIUM' | 'HIGH'

export interface UserPreference {
  id: number
  user_id: number
  cooking_skill: CookingSkill | null
  max_time: number | null
  allergies: string[] | null
  cooking_tools: string[] | null
  dietary_habits: string | null
}

export interface UserPreferenceUpdate {
  cooking_skill?: CookingSkill | null
  max_time?: number | null
  allergies?: string[] | null
  cooking_tools?: string[] | null
  dietary_habits?: string | null
}

export interface UserUpdate {
  nickname: string
}

export const updateMe = async (body: UserUpdate): Promise<UserResponse> => {
  const { data } = await client.patch<UserResponse>('/users/me', body)
  return data
}

export const getMe = async (): Promise<UserResponse> => {
  const { data } = await client.get<UserResponse>('/users/me')
  return data
}

export const getMyPreference = async (): Promise<UserPreference | null> => {
  const { data } = await client.get<UserPreference | null>('/users/me/preference')
  return data
}

export const updateMyPreference = async (
  body: UserPreferenceUpdate
): Promise<UserPreference> => {
  const { data } = await client.put<UserPreference>('/users/me/preference', body)
  return data
}
