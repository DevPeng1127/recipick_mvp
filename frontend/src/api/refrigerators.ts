import type {
  Refrigerator,
  RefrigeratorCreate,
  RefrigeratorDetail,
  RefrigeratorUpdate,
} from '../types/refrigerator'
import client from './client'

export const listRefrigerators = async (): Promise<Refrigerator[]> => {
  const { data } = await client.get<Refrigerator[]>('/refrigerators')
  return data
}

export const createRefrigerator = async (
  body: RefrigeratorCreate
): Promise<Refrigerator> => {
  const { data } = await client.post<Refrigerator>('/refrigerators', body)
  return data
}

export const getRefrigerator = async (id: number): Promise<RefrigeratorDetail> => {
  const { data } = await client.get<RefrigeratorDetail>(`/refrigerators/${id}`)
  return data
}

export const updateRefrigerator = async (
  id: number,
  body: RefrigeratorUpdate
): Promise<Refrigerator> => {
  const { data } = await client.put<Refrigerator>(`/refrigerators/${id}`, body)
  return data
}

export const deleteRefrigerator = async (id: number): Promise<void> => {
  await client.delete(`/refrigerators/${id}`)
}

export const toggleFavorite = async (id: number): Promise<{ is_favorite: boolean }> => {
  const { data } = await client.patch<{ is_favorite: boolean }>(`/refrigerators/${id}/favorite`)
  return data
}

export const reorderRefrigerators = async (orderedIds: number[]): Promise<void> => {
  await client.put('/refrigerators/reorder', { ordered_ids: orderedIds })
}

export const reorderStorageBoxes = async (
  refrigeratorId: number,
  orderedIds: number[]
): Promise<void> => {
  await client.put(
    `/refrigerators/${refrigeratorId}/storage-boxes/reorder`,
    { ordered_ids: orderedIds }
  )
}
