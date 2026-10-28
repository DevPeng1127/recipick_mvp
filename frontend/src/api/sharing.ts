import client from './client'
import type { RefrigeratorMember } from '../types/refrigerator'

export interface Invitation {
  id: number
  created_at: string
  expires_at: string
  status: 'active' | 'expired' | 'revoked' | 'used'
}
export interface InvitationPreview {
  refrigerator_id: number
  refrigerator_name: string
  expires_at: string
  already_member: boolean
}
export const listMembers = async (id: number) =>
  (await client.get<RefrigeratorMember[]>(`/refrigerators/${id}/members`)).data
export const listInvitations = async (id: number) =>
  (await client.get<Invitation[]>(`/refrigerators/${id}/invitations`)).data
export const createInvitation = async (id: number) =>
  (await client.post<Invitation & { url: string }>(`/refrigerators/${id}/invitations`)).data
export const revokeInvitation = async (id: number, invitationId: number) => {
  await client.delete(`/refrigerators/${id}/invitations/${invitationId}`)
}
export const removeMember = async (id: number, userId: number | 'me') => {
  await client.delete(`/refrigerators/${id}/members/${userId}`)
}
export const previewInvitation = async (token: string) =>
  (await client.post<InvitationPreview>('/invitations/preview', { token })).data
export const acceptInvitation = async (token: string) =>
  (await client.post<{ refrigerator_id: number; already_member: boolean }>('/invitations/accept', { token })).data
