import client from './client'
import type { Ingredient, IngredientCreate } from '../types/ingredient'
import type { StorageBox } from '../types/storage'
import type { ReceiptPreview } from './receiptImport'

export type DistributedIngredient = IngredientCreate & { storage_box_id: number }

export async function getImportStorageBox(id: number): Promise<StorageBox> {
  const { data } = await client.get<StorageBox>(`/storage-boxes/${id}`)
  return data
}

export async function previewRefrigeratorImport(
  refrigeratorId: number, mode: 'receipt' | 'voice', file: File, signal?: AbortSignal,
): Promise<ReceiptPreview> {
  const { data } = await client.post<ReceiptPreview>(
    `/refrigerators/${refrigeratorId}/ingredients/${mode}-preview`, file,
    { headers: { 'Content-Type': mode === 'voice' ? 'audio/wav' : file.type }, timeout: 75_000, signal },
  )
  return data
}

export async function createDistributedIngredients(refrigeratorId: number, items: DistributedIngredient[]): Promise<Ingredient[]> {
  const { data } = await client.post<Ingredient[]>(
    `/refrigerators/${refrigeratorId}/ingredients/batch`, { items }, { timeout: 30_000 },
  )
  return data
}
