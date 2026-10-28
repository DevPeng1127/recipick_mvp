import { useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { consumeRecipe, getCookingPreview, repeatRecipe } from '../../api/recipes'
import type { CookingCommit, CookingPreview, CookingResult } from '../../types/recipe'

type Row = { requirementIndex: number; ingredientId: string; quantity: string; included: boolean; message: string | null }
type Phase = 'closed' | 'editing' | 'conflict' | 'uncertain' | 'blocked'

function makeRows(preview: CookingPreview): Row[] {
  return preview.suggestions.map(s => ({ requirementIndex: s.requirement_index,
    ingredientId: s.ingredient_id === null ? '' : String(s.ingredient_id),
    quantity: s.quantity === null ? '' : String(s.quantity), included: true, message: s.message }))
}

export default function CookingPanel({ initial, onRepeat }: { initial: CookingPreview; onRepeat: (id: string) => void }) {
  const [preview, setPreview] = useState(initial)
  const [rows, setRows] = useState<Row[]>([])
  const [phase, setPhase] = useState<Phase>('closed')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CookingResult | null>(initial.result)
  const flight = useRef(false)
  const pending = useRef<CookingCommit | null>(null)
  const locked = busy || phase !== 'editing'
  const chosen = rows.filter(row => row.included)
  const stock = new Map(preview.stock.map(item => [String(item.ingredient_id), item]))
  const totals = new Map<string, number>()
  for (const row of chosen) totals.set(row.ingredientId, (totals.get(row.ingredientId) ?? 0) + Math.round(Number(row.quantity) * 10000))
  const invalid = chosen.length === 0 || chosen.some(row => {
    const item = stock.get(row.ingredientId)
    const value = Number(row.quantity)
    return !item || !Number.isFinite(value) || value <= 0 || value > 1_000_000
      || !/^\d+(\.\d{1,4})?$/.test(row.quantity)
      || (totals.get(row.ingredientId) ?? 0) > 1_000_000 * 10000
      || (totals.get(row.ingredientId) ?? 0) > Math.round(item.quantity * 10000)
  })
  const update = (index: number, patch: Partial<Row>) => setRows(old => old.map((row, i) => i === index ? { ...row, ...patch } : row))

  const refresh = async () => {
    if (flight.current) return
    flight.current = true
    setBusy(true)
    setError('')
    try {
      const latest = await getCookingPreview(preview.plan_id)
      setPreview(latest)
      setResult(latest.result)
      setRows(makeRows(latest))
      pending.current = null
      setPhase('editing')
    } catch {
      setError('최신 재고를 불러오지 못했습니다. 접근 권한과 연결 상태를 확인해 주세요.')
    } finally { flight.current = false; setBusy(false) }
  }

  const confirm = async () => {
    if (flight.current || (phase !== 'uncertain' && invalid)) return
    if (phase !== 'uncertain') {
      pending.current = { items: [...totals].map(([id, quantity]) => ({
        ingredient_id: Number(id), quantity: quantity / 10000, expected_token: stock.get(id)!.token,
      })) }
    }
    if (!pending.current) return
    flight.current = true
    setBusy(true)
    setError('')
    try {
      setResult(await consumeRecipe(preview.plan_id, pending.current))
      pending.current = null
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined
      const code = isAxiosError(err) ? err.response?.data?.detail?.code : undefined
      if (status === 409 && code === 'already_applied') {
        setPhase('conflict')
        setError('이미 처리된 요리입니다. 최신 상태를 불러와 결과를 확인해 주세요.')
      } else if (status === 409) {
        setPhase('conflict')
        setError('재고가 변경되었거나 부족하여 차감하지 않았습니다. 최신 재고를 불러온 뒤 수량을 다시 확인해 주세요.')
      } else if (status === 403 || status === 404) {
        setPhase('blocked')
        setError('이 요리 또는 냉장고에 접근할 수 없습니다. 냉장고 목록을 확인해 주세요.')
      } else if (status === 422) {
        setError('입력값을 확인해 주세요. 재고는 차감되지 않았습니다.')
      } else {
        setPhase('uncertain')
        setError('처리 결과를 확인하지 못했습니다. 아래 버튼은 같은 요청을 재확인하며 중복 차감하지 않습니다.')
      }
    } finally { flight.current = false; setBusy(false) }
  }

  if (result) return <section className="mt-5 p-5 bg-green-50 border border-green-200 rounded-xl space-y-3">
    <h2 className="text-lg font-bold">차감 완료</h2>
    <p role="status">{result.title}의 재고 차감과 소비 이력을 저장했습니다.</p>
    <ul>{result.items.map(item => <li key={item.ingredient_id}>{item.name} {item.quantity}{item.unit} 사용 · 남은 재고 {item.remaining_quantity}{item.unit}</li>)}</ul>
    <p className="text-sm text-gray-600">이 화면을 새로고침해도 다시 차감되지 않습니다. 다른 날 같은 요리를 만들 때만 아래 버튼을 사용하세요.</p>
    <button disabled={busy} className="text-purple-700 underline" onClick={async () => {
      if (flight.current) return
      flight.current = true; setBusy(true); setError('')
      try { const next = await repeatRecipe(preview.plan_id); if (next.plan_id) onRepeat(next.plan_id) }
      catch { setError('새 요리를 준비하지 못했습니다. 다시 시도해 주세요.') }
      finally { flight.current = false; setBusy(false) }
    }}>이 레시피로 다시 요리하기</button>
    {error && <p role="alert" className="text-red-600">{error}</p>}
  </section>

  return <section className="mt-5 p-5 bg-white border border-purple-200 rounded-xl space-y-4">
    <h2 className="text-lg font-bold">요리 후 스마트 차감 · {preview.servings}인분</h2>
    <p className="text-sm text-gray-600">실제로 사용한 재료와 양을 확인해 주세요. 차감 확정 전까지 재고는 그대로입니다.</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {phase === 'closed' ? <button disabled={busy} className="bg-purple-600 text-white rounded-lg px-4 py-2 disabled:opacity-50" onClick={refresh}>
      {busy ? '재고 확인 중…' : '요리 완료 · 사용 재료 확인'}
    </button> : <>
      <p className="text-sm text-gray-500">유통기한이 가까운 재고부터 제안합니다. 연결할 재고를 바꾸면 수량을 다시 입력해 주세요. 직접 산 재료 등 차감하지 않을 행은 체크를 해제하세요.</p>
      <fieldset disabled={locked} className="space-y-3 disabled:opacity-60">
        {rows.map((row, index) => {
          const need = preview.requirements[row.requirementIndex]
          const item = stock.get(row.ingredientId)
          const excess = item && (totals.get(row.ingredientId) ?? 0) > Math.round(item.quantity * 10000)
          return <div key={index} className="border rounded-lg p-3 space-y-2">
            <label className="flex gap-2 items-center"><input type="checkbox" checked={row.included} onChange={e => update(index, { included: e.target.checked })} />
              <span>{need.ingredient_name} · 제안량 {need.quantity ?? '확인 필요'}{need.unit ?? ''}</span>
            </label>
            {row.message && <p className="text-sm text-amber-700">{row.message}</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm min-w-0">차감할 재고
                <select aria-label={`재고 ${index + 1}`} disabled={!row.included} value={row.ingredientId} onChange={e => update(index, { ingredientId: e.target.value, quantity: '' })} className="block w-full min-w-0 border rounded-lg p-2 mt-1">
                  <option value="">재고를 선택하세요</option>
                  {preview.stock.map(s => <option key={s.ingredient_id} value={s.ingredient_id}>{s.name} · {s.refrigerator_name}/{s.storage_box_name} · {s.quantity}{s.unit} · {s.expiry_date || '기한 없음'}</option>)}
                </select>
              </label>
              <label className="text-sm">실제 사용량 {item && `(${item.unit})`}
                <input aria-label={`사용량 ${index + 1}`} type="number" inputMode="decimal" min="0.0001" step="0.0001" disabled={!row.included || !item} value={row.quantity} onChange={e => update(index, { quantity: e.target.value })} className="block w-full border rounded-lg p-2 mt-1" />
              </label>
            </div>
            {row.included && excess && <p role="alert" className="text-sm text-red-600">같은 재고의 합산 사용량이 보유량을 초과합니다.</p>}
          </div>
        })}
      </fieldset>
      {phase === 'conflict' && <button disabled={busy} onClick={refresh} className="text-purple-700 underline">최신 재고 다시 불러오기 (입력 초기화)</button>}
      {phase === 'uncertain' && <button disabled={busy} onClick={confirm} className="bg-purple-600 text-white rounded-lg px-4 py-2">처리 결과 확인 · 같은 요청 재시도</button>}
      {phase === 'editing' && <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy || invalid} onClick={confirm} className="bg-purple-600 text-white rounded-lg px-4 py-2 disabled:opacity-50">{busy ? '차감 중…' : '확인한 재료 일괄 차감'}</button>
        <button disabled={busy} onClick={() => { setPhase('closed'); setError('') }} className="text-gray-600">취소</button>
        {invalid && <p className="text-sm text-gray-500">선택한 모든 행의 재고와 사용량을 확인해 주세요.</p>}
      </div>}
    </>}
  </section>
}
