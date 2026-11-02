import HelpDisclosure from '../common/HelpDisclosure'
import ExpiryInput from './ExpiryInput'
import { recommendExpiry, todayKst } from '../../constants/expiry'
import { useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { previewReceipt, type ReceiptItem } from '../../api/receiptImport'
import { previewVoice } from '../../api/voiceImport'
import { previewRefrigeratorImport } from '../../api/ingredientImport'
import type { StorageBox } from '../../types/storage'
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder'
import type { IngredientCreate, ExpirySource } from '../../types/ingredient'

export type ImportPanelProps = {
  disabled?: boolean
  onSave: (items: (IngredientCreate & { storage_box_id?: number })[]) => Promise<void>
  onClose: () => void
} & ({ refrigeratorId: number; storageBoxes: StorageBox[]; storageBoxId?: number }
  | { storageBoxId: number; refrigeratorId?: never; storageBoxes?: never })

interface Candidate extends Omit<ReceiptItem, 'quantity' | 'unit'> {
  quantity: string
  unit: string
  expiry_date: string | null
  expiry_source: ExpirySource
  expiry_manual: boolean
  selected: boolean
  storage_box_id: string
}

function recognitionError(error: unknown, isVoice: boolean): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (error.response?.status === 429 && typeof detail?.message === 'string') {
      const retry = detail.retry_after_seconds
      return typeof retry === 'number' ? `${detail.message} 약 ${retry}초 후 다시 시도해 주세요.` : detail.message
    }
    if (typeof detail === 'string' && [400, 413, 415, 502].includes(error.response?.status ?? 0)) return detail
    if (error.response?.status === 403) return '이 냉장고에 접근할 권한이 없습니다.'
  }
  return isVoice ? '음성 인식에 실패했습니다. 녹음을 확인한 뒤 다시 시도해 주세요.'
    : '영수증 인식에 실패했습니다. 사진을 확인한 뒤 다시 시도해 주세요.'
}

export default function IngredientImportPanel({ storageBoxId, refrigeratorId, storageBoxes, onSave, onClose, mode, disabled = false }: ImportPanelProps & { mode: 'receipt' | 'voice' }) {
  const isVoice = mode === 'voice'
  const label = isVoice ? '음성' : '영수증'
  const recording = useVoiceRecorder()
  const recordingActive = ['requesting', 'recording', 'processing'].includes(recording.status)
  const [photo, setFile] = useState<File | null>(null)
  const file = isVoice ? recording.file : photo
  const [imageUrl, setImageUrl] = useState('')
  const [storedCandidates, setCandidates] = useState<Candidate[] | null>(null)
  const [baseDate] = useState(todayKst)
  const candidates = storedCandidates?.map(item => item.expiry_manual ? item : {
    ...item, ...recommendExpiry(item.name, storageBoxes?.find(box => box.id === Number(item.storage_box_id))?.type, baseDate),
  }) ?? null
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState<'analyzing' | 'saving' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uncertainSave, setUncertainSave] = useState(false)
  const [bulkBox, setBulkBox] = useState('')
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
    if (!file || disabled || busyRef.current || uncertainSave) return
    busyRef.current = true
    setBusy('analyzing'); setError(null)
    controller.current = new AbortController()
    try {
      const result = refrigeratorId !== undefined
        ? await previewRefrigeratorImport(refrigeratorId, mode, file, controller.current.signal)
        : await (isVoice ? previewVoice : previewReceipt)(storageBoxId!, file, controller.current.signal)
      if (!mounted.current) return
      setCandidates(result.items.map(item => ({
        ...item, quantity: item.quantity === null ? '' : String(item.quantity),
        unit: item.unit ?? '', expiry_date: null, expiry_source: 'unknown', expiry_manual: false, selected: true,
        storage_box_id: storageBoxId === undefined ? '' : String(storageBoxId),
      })))
      setHasMore(result.has_more)
    } catch (reason) {
      if (mounted.current && !controller.current.signal.aborted) setError(recognitionError(reason, isVoice))
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
      if (refrigeratorId !== undefined && !storageBoxes?.some(box => box.id === Number(item.storage_box_id))) {
        setError('선택한 모든 식재료의 보관함을 지정해 주세요.'); return
      }
      const quantity = Number(item.quantity)
      if (!item.name.trim() || item.name.trim().length > 100 || !item.quantity.trim()
        || !Number.isFinite(quantity) || quantity <= 0 || !item.unit.trim() || item.unit.trim().length > 20) {
        setError('선택한 항목의 이름, 0보다 큰 수량, 단위를 확인해 주세요.'); return
      }
      if (['label', 'estimated'].includes(item.expiry_source) && !item.expiry_date) {
        setError('기한 날짜를 입력하거나 기한 미입력을 선택해 주세요.'); return
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
        expiry_date: item.expiry_date || null, expiry_source: item.expiry_source,
        ...(refrigeratorId !== undefined ? { storage_box_id: Number(item.storage_box_id) } : {}),
      })))
      if (mounted.current) onClose()
    } catch (reason) {
      if (!mounted.current) return
      const status = isAxiosError(reason) ? reason.response?.status : undefined
      if (status === undefined || status >= 500) {
        setUncertainSave(true)
        setError('저장 결과를 확인할 수 없습니다. 중복 등록을 막기 위해 입력을 닫고 재고 목록을 확인한 뒤 다시 등록해 주세요.')
      } else if (status === 403) {
        setError('이 냉장고에 등록할 권한이 없습니다. 입력 내용은 유지됩니다.')
      } else if (status === 409) {
        setError('보관함이 변경되어 아무것도 저장하지 않았습니다. 보관함을 다시 선택해 주세요. 입력 내용은 유지됩니다.')
      } else {
        setError('저장되지 않았습니다. 입력값을 확인하고 다시 등록해 주세요.')
      }
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(null)
    }
  }

  return (
    <section aria-label={`${label}으로 식재료 등록`} className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 sm:p-6 mb-6">
      <HelpDisclosure label={`${label} 등록`} className="mb-3" title={<h2 className="text-lg font-semibold text-gray-800">{label}으로 등록</h2>}
        action={<button type="button" onClick={onClose} disabled={!!busy} aria-label={`${label} 입력 닫기`}
          className="text-sm text-gray-500 px-2 py-1 disabled:opacity-40">닫기</button>}>
        <p>{refrigeratorId !== undefined ? '인식 결과를 확인하고 재료별 보관함을 지정해 한 번에 등록하세요.' : '인식 결과를 확인하고 수정한 뒤 현재 보관함에 등록하세요.'}</p>
        {isVoice && <p>예: “우유 두 팩, 계란 열 개, 사과 세 개를 등록해 줘.” 녹음 후 미리듣기와 재녹음이 가능합니다.</p>}
        <p>사진·음성 인식과 레시피 추천은 AI 사용 한도를 공유합니다. 인식만으로 재고가 저장되지는 않습니다.</p>
      </HelpDisclosure>
      <p className="text-xs text-gray-500 mb-4">
        {isVoice ? '인식 버튼을 누르면 녹음이 Google AI로 전송됩니다. 식재료 이름·수량·단위만 말하고 개인정보나 다른 사람의 대화는 담지 마세요.'
          : '사진은 Google AI로 전송됩니다. 결제·회원 정보 등 개인정보를 제외한 상품 영역만 선택해 주세요.'}
        앱 서버에는 {isVoice ? '녹음' : '사진'}을 보관하지 않습니다. 무료 AI의 입력은 Google의 서비스 개선에 사용될 수 있습니다.
      </p>
      {isVoice ? <div>
        <p className="text-xs text-gray-500">최대 60초 · 식재료 20개</p>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          {recording.status === 'recording' ? <button type="button" onClick={recording.stop}
            className="rounded-lg bg-red-600 px-4 py-2 text-white">녹음 끝내기</button>
            : <button type="button" disabled={disabled || !!busy || uncertainSave || recordingActive} onClick={() => {
              setCandidates(null); setHasMore(false); setError(null); void recording.start()
            }} className="rounded-lg border border-purple-300 bg-white px-4 py-2 text-purple-700 disabled:opacity-50">
              {file ? '다시 녹음' : '녹음 시작'}
            </button>}
          {recordingActive && <button type="button" onClick={recording.cancel} className="text-sm text-gray-600">녹음 취소</button>}
          <span role="status" aria-live="polite" className="text-sm text-gray-600">
            {recording.status === 'requesting' ? '마이크 허용을 기다리고 있어요...'
              : recording.status === 'recording' ? `녹음 중 ${recording.elapsed} / 60초`
                : recording.status === 'processing' ? '녹음을 준비하고 있어요...'
                  : file ? '녹음 완료 · 내용을 듣고 인식해 주세요.' : '녹음 시작을 누르면 마이크 권한을 요청합니다.'}
          </span>
        </div>
        {recording.error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{recording.error}</p>}
        {imageUrl && <audio controls src={imageUrl} aria-label="녹음 미리듣기" className="mt-4 w-full max-w-md" />}
      </div> : <>
      <label className="block text-sm font-medium text-gray-700" htmlFor="receipt-photo">영수증 사진</label>
      <input id="receipt-photo" type="file" accept="image/jpeg,image/png" disabled={disabled || !!busy || uncertainSave}
        onChange={event => chooseFile(event.target.files?.[0])}
        className="block w-full min-w-0 text-sm text-gray-600 mt-2 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-purple-700" />
      <p className="text-xs text-gray-500 mt-2">JPEG·PNG 한 장 · 최대 5MB / 2천만 화소 · 최대 20개 식재료</p>
      {imageUrl && <img src={imageUrl} alt="선택한 영수증" className="mt-4 max-h-48 max-w-full rounded-lg border bg-white object-contain" />}
      </>}
      <button type="button" disabled={disabled || !file || !!busy || uncertainSave} onClick={analyze}
        className="mt-4 rounded-lg bg-purple-600 px-4 py-2 text-white disabled:opacity-50">
        {busy === 'analyzing' ? (isVoice ? '음성을 읽고 있어요...' : '사진을 읽고 있어요...') : (isVoice ? '음성 인식하기' : '사진 인식하기')}
      </button>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {candidates?.length === 0 && <p className="mt-4 text-sm text-gray-600">등록할 식재료를 찾지 못했습니다. {isVoice ? '식재료 이름과 수량을 또렷하게 말하고 다시 시도해 주세요.' : '상품명이 잘 보이는 사진으로 다시 시도해 주세요.'}</p>}
      {hasMore && <p role="status" className="mt-4 text-sm text-amber-800">식재료가 20개를 초과했습니다. 아래 항목을 확인하고 나머지는 별도로 등록해 주세요.</p>}
      {!!candidates?.length && (
        <div className="mt-6">
          <HelpDisclosure label="인식 결과 확인" className="mb-3" title={<h3 className="font-medium text-gray-800">인식 결과 확인 · {candidates.length}개</h3>}>
            <p>{isVoice ? '말한 이름·수량·단위가 맞는지 확인하세요.' : '가격·용량과 구매 수량이 혼동되지 않았는지 확인하세요.'} 보관함을 지정하면 기준이 있는 재료의 추정 사용 권장일을 자동으로 채웁니다. 제품 소비기한은 직접 입력해 주세요.</p>
            <p>등록 당일의 신선한 원물 기준입니다. 냉장 4℃ 이하·냉동 -18℃ 이하, 실온은 서늘하고 건조한 곳(약 10~16℃)을 전제로 합니다. 구입·개봉 시점이나 보관 상태가 다르면 날짜를 수정해 주세요. 가공·해동 제품이나 기준이 없는 재료에는 날짜를 추측하지 않습니다.</p>
            {storageBoxes && <p>보관함 일괄 지정은 체크한 항목에 적용합니다. 각 항목에서 보관함을 따로 바꿀 수도 있습니다.</p>}
          </HelpDisclosure>
          <p className="text-sm text-gray-500 mb-3">이름·수량·보관함·기한을 확인한 뒤 등록해 주세요.</p>
          {storageBoxes && <fieldset disabled={!!busy || uncertainSave} className="mb-4 rounded-lg border border-purple-200 p-3">
            <label className="block text-sm text-gray-700">포함된 항목의 보관함 일괄 지정
              <select value={bulkBox} onChange={event => setBulkBox(event.target.value)} className="mt-2 w-full min-w-0 rounded border bg-white px-2 py-2 text-sm">
                <option value="">보관함 선택</option>
                {storageBoxes.map(box => <option key={box.id} value={box.id}>{box.name} · {box.type === 'FRIDGE' ? '냉장' : box.type === 'FREEZER' ? '냉동' : '실온'}</option>)}
              </select>
            </label>
            <button type="button" disabled={!selectedCount || !storageBoxes.some(box => box.id === Number(bulkBox))}
              onClick={() => { setCandidates(current => current?.map(item => item.selected ? { ...item, storage_box_id: bulkBox } : item) ?? null); setError(null) }}
              className="mt-2 rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm text-purple-700 disabled:opacity-40">포함된 {selectedCount}개에 적용</button>
          </fieldset>}
          <div className="space-y-3">
            {candidates.map((item, index) => (
              <fieldset key={index} disabled={!!busy || uncertainSave} className={`rounded-lg border bg-white p-3 ${item.selected ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                <div className="flex items-center gap-2 mb-3">
                  <input type="checkbox" checked={item.selected} aria-label={`항목 ${index + 1} 포함`}
                    onChange={event => edit(index, { selected: event.target.checked })} className="h-4 w-4 accent-purple-600" />
                  <span className="text-xs text-gray-500 break-all">{isVoice ? '말한 내용' : '영수증'}: {item.source_text}</span>
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
                  <div className="col-span-2 sm:col-span-1">
                    <ExpiryInput value={item} suffix={` ${index + 1}`}
                      suggestion={recommendExpiry(item.name, storageBoxes?.find(box => box.id === Number(item.storage_box_id))?.type, baseDate)}
                      onChange={value => edit(index, { ...value, expiry_manual: true })}
                      onApplySuggestion={() => edit(index, { expiry_manual: false })} />
                  </div>
                </div>
                {storageBoxes && <label className="mt-3 block text-xs text-gray-600">보관함 (필수)
                  <select aria-label={`보관함 ${index + 1}`} value={item.storage_box_id}
                    onChange={event => edit(index, { storage_box_id: event.target.value })}
                    className="mt-1 w-full min-w-0 rounded border bg-white px-2 py-2 text-sm text-gray-800">
                    <option value="">보관함 선택</option>
                    {item.storage_box_id && !storageBoxes.some(box => box.id === Number(item.storage_box_id)) && <option value={item.storage_box_id}>사용할 수 없는 보관함 · 다시 선택해 주세요</option>}
                    {storageBoxes.map(box => <option key={box.id} value={box.id}>{box.name} · {box.type === 'FRIDGE' ? '냉장' : box.type === 'FREEZER' ? '냉동' : '실온'}</option>)}
                  </select>
                </label>}
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
