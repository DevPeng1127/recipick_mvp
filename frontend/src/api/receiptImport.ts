import client from './client'
import type { Ingredient, IngredientCreate } from '../types/ingredient'

export interface ReceiptItem {
  source_text: string
  name: string
  quantity: number | null
  unit: string | null
  needs_review: boolean
}

export interface ReceiptPreview {
  items: ReceiptItem[]
  has_more: boolean
}

export async function previewReceipt(storageBoxId: number, file: File, signal?: AbortSignal): Promise<ReceiptPreview> {
  const { data } = await client.post<ReceiptPreview>(
    `/storage-boxes/${storageBoxId}/ingredients/receipt-preview`, file,
    { headers: { 'Content-Type': file.type }, timeout: 75_000, signal },
  )
  return data
}

export async function createIngredientsBatch(storageBoxId: number, items: IngredientCreate[]): Promise<Ingredient[]> {
  const { data } = await client.post<Ingredient[]>(
    `/storage-boxes/${storageBoxId}/ingredients/batch`, { items }, { timeout: 30_000 },
  )
  return data
}
