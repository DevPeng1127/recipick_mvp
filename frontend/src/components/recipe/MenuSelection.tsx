import HelpDisclosure from '../common/HelpDisclosure'
import { useEffect, useState } from 'react'
import { getMenuInventory } from '../../api/recipes'
import { expiryText } from '../../constants/expiry'
import { expiryGroup } from '../../constants/menu'
import type { MenuIngredient, MenuInventory } from '../../types/recipe'
import type { Refrigerator } from '../../types/refrigerator'
import RecipeRecommendButton from './RecipeRecommendButton'

interface Props {
  refrigerators: Refrigerator[]
  busy: boolean
  onRecommend: (fridges: number[], servings: number, priorities: number[]) => Promise<void>
}
type InventoryState = { key: string; data?: MenuInventory; error?: string }

export default function MenuSelection({ refrigerators, busy, onRecommend }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [priorities, setPriorities] = useState<Set<number>>(new Set())
  const [servings, setServings] = useState(1)
  const [revision, setRevision] = useState(0)
  const [inventory, setInventory] = useState<InventoryState>({ key: '' })
  const selectedIds = refrigerators.filter(item => selected.has(item.id)).map(item => item.id).sort((a, b) => a - b)
  const idsKey = selectedIds.join(',')
  const requestKey = `${idsKey}:${revision}`
  const current = inventory.key === requestKey ? inventory : undefined
  const data = current?.data
  const loading = selectedIds.length > 0 && !data && !current?.error
  const items = data?.ingredients ?? []
  const grouped = { soon: [] as MenuIngredient[], later: [] as MenuIngredient[], past: [] as MenuIngredient[] }
  if (data) for (const item of items) grouped[expiryGroup(item, data.as_of)].push(item)
  const chosen = items.filter(item => priorities.has(item.ingredient_id) && expiryGroup(item, data!.as_of) !== 'past')

  useEffect(() => {
    if (!idsKey) return
    const controller = new AbortController()
    const key = `${idsKey}:${revision}`
    getMenuInventory(idsKey.split(',').map(Number), controller.signal).then(data => {
      if (!controller.signal.aborted) setInventory({ key, data })
    }).catch(() => {
      if (!controller.signal.aborted) setInventory({ key, error: '재료 목록을 불러오지 못했습니다. 냉장고 접근 권한과 연결 상태를 확인해 주세요.' })
    })
    return () => controller.abort()
  }, [idsKey, revision])

  const toggleFridge = (id: number) => {
    setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })
    setPriorities(new Set())
    setInventory({ key: '' })
  }
  const toggleIngredient = (id: number) => setPriorities(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id)
    else if (next.size < 30) next.add(id)
    return next
  })
  const row = (item: MenuIngredient, past = false) => <label key={item.ingredient_id}
    className={`flex gap-3 rounded-lg border bg-white p-3 text-sm ${past ? 'text-gray-500' : 'text-gray-800'}`}>
    {!past && <input type="checkbox" className="mt-1 shrink-0" aria-label={`${item.name} · ${item.storage_box_name} · 재고 ${item.ingredient_id}`}
      checked={priorities.has(item.ingredient_id)} disabled={busy || (!priorities.has(item.ingredient_id) && chosen.length >= 30)}
      onChange={() => toggleIngredient(item.ingredient_id)} />}
    <span className="min-w-0 break-words"><span className="font-medium">{item.name}</span> · {item.quantity}{item.unit}
      <span className="block text-xs text-gray-500">{item.refrigerator_name} / {item.storage_box_name}</span>
      <span className="block text-xs mt-1">{expiryText(item.expiry_date, item.expiry_source)}</span>
    </span>
  </label>

  return <section aria-label="메뉴 추천 조건" className="space-y-5 mb-6">
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {refrigerators.map(fridge => <button key={fridge.id} type="button" disabled={busy}
        aria-pressed={selected.has(fridge.id)} onClick={() => toggleFridge(fridge.id)}
        className={`p-4 rounded-xl border-2 text-left break-words disabled:opacity-60 ${selected.has(fridge.id) ? 'bg-purple-50 border-purple-300' : 'bg-white border-gray-200'}`}>
        <span className="font-medium">{selected.has(fridge.id) ? '✓ ' : ''}{fridge.name}</span>
        <span className="block text-xs text-gray-500 mt-1">식재료 {fridge.total_ingredient_count}개</span>
      </button>)}
    </div>
    {selectedIds.length > 0 && <section aria-label="우선 활용 재료" className="space-y-3">
      <HelpDisclosure label="우선 활용 재료" title={<h2 className="font-semibold text-gray-800">우선 활용할 재료 · {chosen.length}개 선택</h2>}
        action={<button type="button" disabled={busy || loading} className="text-xs text-purple-700 underline disabled:opacity-50"
          onClick={() => { setPriorities(new Set()); setRevision(value => value + 1) }}>목록 새로고침 (선택 초기화)</button>}>
        <p>선택하지 않아도 냉장고 전체에서 추천합니다. 최대 30개를 우선 요청할 수 있고, 어울리지 않으면 나누거나 제외 이유를 알려드립니다.</p>
      </HelpDisclosure>
      {loading && <p role="status">재료 목록을 불러오는 중…</p>}
      {current?.error && <p role="alert" className="text-sm text-red-600">{current.error}</p>}
      {data && <>
        {items.length === 0 ? <p className="text-sm text-gray-500">선택한 냉장고에 재료가 없습니다.</p> : <>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <HelpDisclosure label="임박 재료 기준" title={<h3 className="font-medium">기한이 가까운 재료 · 3일 이내</h3>}>
              <p>한국 날짜 {data.as_of} 기준 오늘~3일 남은 재료입니다. 추정 권장일과 제품 소비기한을 구분해 표시합니다.</p>
            </HelpDisclosure>
            <p className="text-xs text-gray-600">제품 표시·개봉 및 보관 상태를 먼저 확인해 주세요.</p>
            {grouped.soon.length ? <>
              <div className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">{grouped.soon.map(item => row(item))}</div>
              <button type="button" disabled={busy || grouped.soon.every(item => priorities.has(item.ingredient_id)) || chosen.length >= 30}
                className="text-sm text-purple-700 underline disabled:opacity-50" onClick={() => setPriorities(previous => new Set([...previous, ...grouped.soon.map(item => item.ingredient_id)].slice(0, 30)))}>
                임박 재료를 우선 선택 (최대 30개)
              </button>
            </> : <p className="text-sm text-gray-500">오늘~3일 이내인 재료가 없습니다.</p>}
          </div>
          {grouped.later.length > 0 && <details className="rounded-xl border bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium">다른 재료에서 선택 · {grouped.later.length}개</summary>
            <div className="grid sm:grid-cols-2 gap-2 mt-3 max-h-80 overflow-y-auto">{grouped.later.map(item => row(item))}</div>
          </details>}
          {grouped.past.length > 0 && <details className="rounded-xl border bg-gray-50 p-4">
            <summary className="cursor-pointer text-sm font-medium">날짜가 지나 상태 확인이 필요한 재료 · {grouped.past.length}개</summary>
            <p className="text-xs text-gray-600 my-2">추천 우선 선택에서 제외했습니다. 보관함에서 제품 표시와 상태를 확인해 주세요. 날짜만으로 섭취 가능 여부를 판단하지 않습니다.</p>
            <div className="grid sm:grid-cols-2 gap-2">{grouped.past.map(item => row(item, true))}</div>
          </details>}
          {chosen.length > 0 && <div className="text-sm text-purple-800 bg-purple-50 rounded-lg p-3">
            <p>우선 요청: {chosen.map(item => item.name).join(', ')}</p>
            <button type="button" disabled={busy} className="text-xs underline mt-1" onClick={() => setPriorities(new Set())}>재료 선택 해제</button>
          </div>}
        </>}
      </>}
    </section>}
    <label className="block text-sm text-gray-600">몇 인분을 먹을까요?
      <select aria-label="인분" value={servings} disabled={busy} onChange={event => setServings(Number(event.target.value))} className="ml-3 border rounded-lg p-2">
        {Array.from({ length: 8 }, (_, i) => i + 1).map(count => <option key={count} value={count}>{count}인분</option>)}
      </select>
    </label>
    <RecipeRecommendButton isLoading={busy} selectedCount={selectedIds.length}
      disabled={!data || items.length === 0 || loading || !!current?.error}
      onClick={() => { void onRecommend(selectedIds, servings, chosen.map(item => item.ingredient_id)) }} />
  </section>
}
