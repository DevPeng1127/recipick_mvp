import HelpDisclosure from '../components/common/HelpDisclosure'
import { useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { getRefrigerator, listRefrigerators } from '../api/refrigerators'
import { createDistributedIngredients, getImportStorageBox } from '../api/ingredientImport'
import IngredientImportPanel from '../components/ingredient/IngredientImportPanel'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { useToastStore } from '../stores/useToastStore'
import type { Refrigerator, RefrigeratorDetail } from '../types/refrigerator'

export default function IngredientImportPage() {
  const location = useLocation()
  return <ImportSession key={location.search} />
}

function ImportSession() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const mode = params.get('mode') === 'voice' ? 'voice' : 'receipt'
  const requestedFridge = params.get('refrigerator')
  const requestedBox = params.get('storageBox')
  const [fridges, setFridges] = useState<Refrigerator[]>([])
  const [fridgeId, setFridgeId] = useState('')
  const [defaultBox, setDefaultBox] = useState<number>()
  const [context, setContext] = useState<RefrigeratorDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const mounted = useRef(true)
  const startingRef = useRef(false)

  useEffect(() => {
    let active = true
    mounted.current = true
    setLoading(true); setError('')
    async function load() {
      try {
        const [available, box] = await Promise.all([
          listRefrigerators(), requestedBox ? getImportStorageBox(Number(requestedBox)) : Promise.resolve(null),
        ])
        if (!active) return
        const selectedId = box?.refrigerator_id ?? (requestedFridge ? Number(requestedFridge) : undefined)
        if (selectedId !== undefined && !available.some(fridge => fridge.id === selectedId)) throw new Error('unavailable')
        setFridges(available)
        setFridgeId(selectedId !== undefined ? String(selectedId) : available.length === 1 ? String(available[0].id) : '')
        setDefaultBox(box?.id)
      } catch {
        if (active) setError('냉장고 정보를 불러오지 못했습니다. 접근 권한과 연결 상태를 확인해 주세요.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false; mounted.current = false }
  }, [requestedBox, requestedFridge, retry])

  async function start() {
    if (!fridgeId || startingRef.current) return
    startingRef.current = true; setStarting(true); setError('')
    try {
      const detail = await getRefrigerator(Number(fridgeId))
      if (!mounted.current) return
      if (defaultBox !== undefined && !detail.storage_boxes.some(box => box.id === defaultBox)) setDefaultBox(undefined)
      setContext(detail)
    } catch {
      if (mounted.current) setError('냉장고를 열 수 없습니다. 접근 권한과 연결 상태를 확인해 주세요.')
    } finally {
      startingRef.current = false
      if (mounted.current) setStarting(false)
    }
  }

  const returnTo = context ? (defaultBox ? `/storage-boxes/${defaultBox}` : `/refrigerators/${context.id}`) : '/dashboard'
  return <div className="mx-auto max-w-3xl">
    <HelpDisclosure label="식재료 자동 입력" className="mb-5" title={<h1 className="text-2xl font-bold text-gray-800">식재료 자동 입력</h1>}>
      <p>냉장고를 선택하고 {mode === 'voice' ? '녹음' : '영수증 사진'}으로 여러 보관함에 나누어 등록하세요.</p>
    </HelpDisclosure>
    {loading ? <LoadingSpinner /> : !context ? <div className="rounded-xl border bg-white p-4 sm:p-6">
      {!!fridges.length && <>
        <label className="block text-sm text-gray-700">등록할 냉장고
          <select value={fridgeId} disabled={starting} onChange={event => { setFridgeId(event.target.value); setDefaultBox(undefined); setError('') }}
            className="mt-2 w-full min-w-0 rounded-lg border px-3 py-2">
            <option value="">냉장고 선택</option>
            {fridges.map(fridge => <option key={fridge.id} value={fridge.id}>{fridge.name}</option>)}
          </select>
        </label>
        <button type="button" disabled={!fridgeId || starting} onClick={start}
          className="mt-4 rounded-lg bg-purple-600 px-4 py-2 text-white disabled:opacity-50">
          {starting ? '보관함 확인 중...' : `${mode === 'voice' ? '음성' : '영수증'} 입력 시작`}
        </button>
      </>}
      {!fridges.length && !error && <p className="text-sm text-gray-600">먼저 냉장고를 추가하거나 가족 초대를 수락해 주세요.</p>}
      {error && <><p role="alert" className="mt-3 text-sm text-red-600">{error}</p>
        {!fridges.length && <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 text-purple-700">다시 불러오기</button>}</>}
    </div> : <>
      <p className="mb-3 font-medium text-gray-700 break-words">등록할 냉장고: {context.name}</p>
      {!context.storage_boxes.length ? <p className="rounded-xl border bg-white p-5 text-sm text-gray-600">
        {context.role === 'OWNER' ? '냉장고 화면에서 보관함을 먼저 추가해 주세요.' : '소유자가 보관함을 추가하면 식재료를 등록할 수 있습니다.'}
      </p> : null}
      <IngredientImportPanel mode={mode} refrigeratorId={context.id} storageBoxes={context.storage_boxes} storageBoxId={defaultBox}
        disabled={!context.storage_boxes.length}
        onClose={() => navigate(returnTo)}
        onSave={async items => {
          try {
            const created = await createDistributedIngredients(context.id, items.map(item => {
              if (item.storage_box_id === undefined) throw new Error('Missing storage box')
              return { ...item, storage_box_id: item.storage_box_id }
            }))
            if (mounted.current) useToastStore.getState().addToast('success', `${created.length}개 식재료가 지정한 보관함에 등록되었습니다.`)
          } catch (reason) {
            if (isAxiosError(reason) && reason.response?.status === 409) {
              // Refresh choices without discarding corrected names, quantities or selections.
              try {
                const latest = await getRefrigerator(context.id)
                if (mounted.current) setContext(current => current ? { ...current, storage_boxes: latest.storage_boxes } : current)
              } catch { /* Preserve the draft if refreshing also fails. */ }
            }
            throw reason
          }
        }} />
    </>}
    {!context && <Link to={returnTo} className="mt-5 inline-block text-sm text-purple-700">냉장고로 돌아가기</Link>}
  </div>
}
