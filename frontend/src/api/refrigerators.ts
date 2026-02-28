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
