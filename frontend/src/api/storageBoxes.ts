import type { StorageBox, StorageBoxCreate, StorageBoxUpdate } from '../types/storage'
import client from './client'

export const listStorageBoxes = async (
  refrigeratorId: number
): Promise<StorageBox[]> => {
  const { data } = await client.get<StorageBox[]>(
    `/refrigerators/${refrigeratorId}/storage-boxes`
  )
  return data
}

export const createStorageBox = async (
  refrigeratorId: number,
  body: StorageBoxCreate
): Promise<StorageBox> => {
  const { data } = await client.post<StorageBox>(
    `/refrigerators/${refrigeratorId}/storage-boxes`,
    body
  )
  return data
}

export const updateStorageBox = async (
  refrigeratorId: number,
  storageBoxId: number,
  body: StorageBoxUpdate
): Promise<StorageBox> => {
  const { data } = await client.put<StorageBox>(
    `/refrigerators/${refrigeratorId}/storage-boxes/${storageBoxId}`,
    body
  )
  return data
}

export const deleteStorageBox = async (
  refrigeratorId: number,
  storageBoxId: number
): Promise<void> => {
  await client.delete(
    `/refrigerators/${refrigeratorId}/storage-boxes/${storageBoxId}`
  )
}
