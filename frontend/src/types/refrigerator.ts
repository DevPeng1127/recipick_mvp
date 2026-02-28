import type { StorageBox } from './storage'

export type MemberRole = 'OWNER' | 'GUEST'

export interface RefrigeratorMember {
  id: number
  user_id: number
  role: MemberRole
  nickname?: string
}

export interface Refrigerator {
  id: number
  name: string
  created_at: string
}

export interface RefrigeratorDetail extends Refrigerator {
  members: RefrigeratorMember[]
  storage_boxes: StorageBox[]
}

export interface RefrigeratorCreate {
  name: string
}

export interface RefrigeratorUpdate {
  name: string
}
