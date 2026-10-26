import { useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { previewReceipt, type ReceiptItem } from '../../api/receiptImport'
import type { IngredientCreate } from '../../types/ingredient'

interface Props {
  storageBoxId: number
  onSave: (items: IngredientCreate[]) => Promise<void>
  onClose: () => void
}

interface Candidate extends Omit<ReceiptItem, 'quantity' | 'unit'> {
  quantity: string
  unit: string
  expiry_date: string
  selected: boolean
}

function recognitionError(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (error.response?.status === 429 && typeof detail?.message === 'string') {
      const retry = detail.retry_after_seconds
      return typeof retry === 'number' ? `${detail.message} 약 ${retry}초 후 다시 시도해 주세요.` : detail.message
    }
    if (typeof detail === 'string' && [400, 413, 415, 502].includes(error.response?.status ?? 0)) return detail
    if (error.response?.status === 403) return '이 보관함에 접근할 권한이 없습니다.'
  }
  return '영수증 인식에 실패했습니다. 사진을 확인한 뒤 다시 시도해 주세요.'
}

export default function ReceiptImportPanel({ storageBoxId, onSave, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState<'analyzing' | 'saving' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uncertainSave, setUncertainSave] = useState(false)
  const busyRef = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort() }
  }, [])

  useEffect(() => {
    if (!file) { setImageUrl(''); return }
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const selectedCount = candidates?.filter(item => item.selected).length ?? 0

  function chooseFile(next: File | undefined) {
    if (busyRef.current) return
    setError(null)
    setCandidates(null)
    setHasMore(false)
    if (!next) { setFile(null); return }
    if (!['image/jpeg', 'image/png'].includes(next.type)) {
      setFile(null); setError('JPEG 또는 PNG 사진을 선택해 주세요.'); return
    }
    if (!next.size || next.size > 5 * 1024 * 1024) {
      setFile(null); setError('사진은 비어 있지 않은 5MB 이하 파일이어야 합니다.'); return
    }
    setFile(next)
  }

  async function analyze() {
    if (!file || busyRef.current || uncertainSave) return
    busyRef.current = true
    setBusy('analyzing'); setError(null)
    controller.current = new AbortController()
    try {
      const result = await previewReceipt(storageBoxId, file, controller.current.signal)
      if (!mounted.current) return
      setCandidates(result.items.map(item => ({
        ...item, quantity: item.quantity === null ? '' : String(item.quantity),
        unit: item.unit ?? '', expiry_date: '', selected: true,
      })))
      setHasMore(result.has_more)
    } catch (reason) {
      if (mounted.current && !controller.current.signal.aborted) setError(recognitionError(reason))
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(null)
    }
  }

  function edit(index: number, changes: Partial<Candidate>) {
    if (busyRef.current || uncertainSave) return
    setCandidates(current => current?.map((item, i) => i === index ? { ...item, ...changes } : item) ?? null)
    setError(null)
  }

  async function save() {
    if (busyRef.current || uncertainSave) return
    const selected = candidates?.filter(item => item.selected) ?? []
    if (!selected.length) { setError('등록할 식재료를 선택해 주세요.'); return }
    for (const item of selected) {
      const quantity = Number(item.quantity)
      if (!item.name.trim() || item.name.trim().length > 100 || !item.quantity.trim()
        || !Number.isFinite(quantity) || quantity <= 0 || !item.unit.trim() || item.unit.trim().length > 20) {
        setError('선택한 항목의 이름, 0보다 큰 수량, 단위를 확인해 주세요.'); return
      }
      if (item.expiry_date && !/^\d{4}-\d{2}-\d{2}$/.test(item.expiry_date)) {
        setError('유통기한을 확인해 주세요.'); return
      }
    }
    busyRef.current = true
    setBusy('saving'); setError(null)
    try {
      await onSave(selected.map(item => ({
        name: item.name.trim(), quantity: Number(item.quantity), unit: item.unit.trim(),
        expiry_date: item.expiry_date || null,
      })))
      if (mounted.current) onClose()
    } catch (reason) {
      if (!mounted.current) return
      const status = isAxiosError(reason) ? reason.response?.status : undefined
      if (status === undefined || status >= 500) {
        setUncertainSave(true)
        setError('저장 결과를 확인할 수 없습니다. 중복 등록을 막기 위해 입력을 닫고 재고 목록을 확인한 뒤 다시 등록해 주세요.')
      } else if (status === 403) {
        setError('이 보관함에 등록할 권한이 없습니다. 입력 내용은 유지됩니다.')
      } else {
        setError('저장되지 않았습니다. 입력값을 확인하고 다시 등록해 주세요.')
      }
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(null)
    }
  }

  return (
    <section aria-label="영수증으로 식재료 등록" className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 sm:p-6 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">영수증으로 등록</h2>
          <p className="text-sm text-gray-600 mt-1">인식 결과를 확인하고 수정한 뒤 현재 보관함에 등록하세요.</p>
        </div>
        <button type="button" onClick={onClose} disabled={!!busy} aria-label="영수증 입력 닫기"
          className="shrink-0 text-sm text-gray-500 px-2 py-1 disabled:opacity-40">닫기</button>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        사진은 Google AI로 전송됩니다. 결제·회원 정보 등 개인정보를 제외한 상품 영역만 선택해 주세요.
        앱 서버에는 사진을 보관하지 않습니다. 무료 AI의 입력은 Google의 서비스 개선에 사용될 수 있습니다.
      </p>
      <label className="block text-sm font-medium text-gray-700" htmlFor="receipt-photo">영수증 사진</label>
      <input id="receipt-photo" type="file" accept="image/jpeg,image/png" disabled={!!busy || uncertainSave}
        onChange={event => chooseFile(event.target.files?.[0])}
        className="block w-full min-w-0 text-sm text-gray-600 mt-2 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-purple-700" />
      <p className="text-xs text-gray-500 mt-2">JPEG·PNG 한 장 · 최대 5MB / 2천만 화소 · 최대 20개 식재료</p>
      {imageUrl && <img src={imageUrl} alt="선택한 영수증" className="mt-4 max-h-48 max-w-full rounded-lg border bg-white object-contain" />}
      <button type="button" disabled={!file || !!busy || uncertainSave} onClick={analyze}
        className="mt-4 rounded-lg bg-purple-600 px-4 py-2 text-white disabled:opacity-50">
        {busy === 'analyzing' ? '사진을 읽고 있어요...' : '사진 인식하기'}
      </button>
      <p className="text-xs text-gray-500 mt-2">레시피 추천과 AI 사용 한도를 공유합니다. 인식만으로 재고가 저장되지는 않습니다.</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {candidates?.length === 0 && <p className="mt-4 text-sm text-gray-600">등록할 식재료를 찾지 못했습니다. 상품명이 잘 보이는 사진으로 다시 시도해 주세요.</p>}
      {hasMore && <p role="status" className="mt-4 text-sm text-amber-800">식재료가 20개를 초과했습니다. 아래 항목을 확인하고 나머지는 별도로 등록해 주세요.</p>}
      {!!candidates?.length && (
        <div className="mt-6">
          <h3 className="font-medium text-gray-800">인식 결과 확인 · {candidates.length}개</h3>
          <p className="text-sm text-gray-500 mt-1 mb-3">가격·용량과 구매 수량이 혼동되지 않았는지 확인하세요. 유통기한은 직접 입력할 수 있습니다.</p>
          <div className="space-y-3">
            {candidates.map((item, index) => (
              <fieldset key={index} disabled={!!busy || uncertainSave} className={`rounded-lg border bg-white p-3 ${item.selected ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <input type="checkbox" checked={item.selected} aria-label={`항목 ${index + 1} 포함`}
                    onChange={event => edit(index, { selected: event.target.checked })} className="h-4 w-4 accent-purple-600" />
                  <span className="text-xs text-gray-500 break-all">영수증: {item.source_text}</span>
                  {item.needs_review && <span className="shrink-0 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">확인 필요</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <label className="col-span-2 sm:col-span-1 text-xs text-gray-600">식재료 이름
                    <input aria-label={`식재료 이름 ${index + 1}`} value={item.name} maxLength={100}
                      onChange={event => edit(index, { name: event.target.value })}
                      className="mt-1 w-full min-w-0 rounded border px-2 py-2 text-sm text-gray-800" />
                  </label>
                  <label className="text-xs text-gray-600">수량
                    <input aria-label={`수량 ${index + 1}`} type="number" step="any" min="0" value={item.quantity}
                      onChange={event => edit(index, { quantity: event.target.value })}
                      className="mt-1 w-full min-w-0 rounded border px-2 py-2 text-sm text-gray-800" />
                  </label>
                  <label className="text-xs text-gray-600">단위
                    <input aria-label={`단위 ${index + 1}`} value={item.unit} maxLength={20} placeholder="개, 팩, kg 등"
                      onChange={event => edit(index, { unit: event.target.value })}
                      className="mt-1 w-full min-w-0 rounded border px-2 py-2 text-sm text-gray-800" />
                  </label>
                  <label className="col-span-2 sm:col-span-1 text-xs text-gray-600">유통기한 (선택)
                    <input aria-label={`유통기한 ${index + 1}`} type="date" value={item.expiry_date}
                      onChange={event => edit(index, { expiry_date: event.target.value })}
                      className="mt-1 w-full min-w-0 rounded border px-2 py-2 text-sm text-gray-800" />
                  </label>
                </div>
              </fieldset>
            ))}
          </div>
          <button type="button" onClick={save} disabled={!selectedCount || !!busy || uncertainSave}
            className="mt-4 w-full sm:w-auto rounded-lg bg-purple-600 px-5 py-3 text-white disabled:opacity-50">
            {busy === 'saving' ? '등록 중...' : `선택한 ${selectedCount}개 등록`}
          </button>
        </div>
      )}
    </section>
  )
}
