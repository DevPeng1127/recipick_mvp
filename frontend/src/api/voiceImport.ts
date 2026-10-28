import client from './client'
import type { ReceiptPreview } from './receiptImport'

export async function previewVoice(storageBoxId: number, file: File, signal?: AbortSignal): Promise<ReceiptPreview> {
  const { data } = await client.post<ReceiptPreview>(
    `/storage-boxes/${storageBoxId}/ingredients/voice-preview`, file,
    { headers: { 'Content-Type': 'audio/wav' }, timeout: 75_000, signal },
  )
  return data
}
