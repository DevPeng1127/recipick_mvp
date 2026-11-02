import HelpDisclosure from '../components/common/HelpDisclosure'
import { expiryText } from '../constants/expiry'
import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { getActivity } from '../api/activity'
import ActivityTrend from '../components/activity/ActivityTrend'
import { useAuthStore } from '../stores/useAuthStore'
import type { ActivityDashboard, ActivityFilters } from '../types/activity'

const timeFormat = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' })
const quantityFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 10 })
const initialFilters: ActivityFilters = { days: 30, refrigeratorId: null, actionType: '' }
type View = { key: string; data: ActivityDashboard | null; error: string; loading: boolean }

export default function MyPage() {
  const userId = useAuthStore(state => state.user?.id)
  const [filters, setFilters] = useState(initialFilters)
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [revision, setRevision] = useState(0)
  const [fridgeOptions, setFridgeOptions] = useState<{ userId: number | undefined; items: ActivityDashboard['refrigerators'] }>({ userId: undefined, items: [] })
  const [view, setView] = useState<View>({ key: '', data: null, error: '', loading: true })
  const cursor = cursors[cursors.length - 1]
  const key = JSON.stringify([userId, filters, cursor, revision])
  const data = view.key === key ? view.data : null
  const error = view.key === key ? view.error : ''
  const loading = view.key !== key || view.loading
  const fridges = fridgeOptions.userId === userId ? fridgeOptions.items : []

  useEffect(() => {
    const controller = new AbortController()
    setView({ key, data: null, error: '', loading: true })
    getActivity(filters, cursor, controller.signal).then(result => {
      if (!controller.signal.aborted) {
        setFridgeOptions({ userId, items: result.refrigerators })
        setView({ key, data: result, error: '', loading: false })
      }
    }).catch(err => {
      if (controller.signal.aborted) return
      const status = isAxiosError(err) ? err.response?.status : undefined
      const message = status === 403 ? '이 냉장고의 가족 기록을 볼 권한이 없습니다. 내 기록으로 돌아가 주세요.'
        : status === 400 ? '목록 조회 정보가 만료되었습니다. 새로고침해 주세요.'
        : '소비·폐기 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
      setView({ key, data: null, error: message, loading: false })
    })
    return () => controller.abort()
  }, [key, filters, cursor, userId])

  function change(patch: Partial<ActivityFilters>) {
    setFilters(old => ({ ...old, ...patch }))
    setCursors([null])
  }
  function refresh() { setCursors([null]); setRevision(old => old + 1) }

  return <div className="space-y-6 min-w-0">
    <HelpDisclosure label="소비·폐기 기록" title={<h1 className="text-2xl font-bold text-gray-800">마이페이지</h1>}
      action={<button onClick={refresh} disabled={loading} className="border bg-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">새로고침</button>}>
      <p>{filters.refrigeratorId === null
        ? '내가 직접 처리한 기록입니다. 탈퇴하거나 삭제된 냉장고의 내 기록도 포함합니다.'
        : '이 냉장고의 가족 전체 기록입니다. 가입 전 기록과 메모도 포함하며, 현재 회원만 조회할 수 있습니다.'}</p>
      <p>재료별 처리 기록 1개를 1건으로 셉니다. 요리 1회에 재료 3개를 차감하면 3건이며, 서로 다른 단위의 수량은 합산하지 않습니다. 모든 통계는 아래 필터를 따릅니다.</p>
    </HelpDisclosure>
    <section className="grid sm:grid-cols-3 gap-4 bg-white p-4 rounded-xl border" aria-label="이력 조회 조건">
      <label className="text-sm min-w-0">기간
        <select aria-label="조회 기간" value={filters.days} onChange={e => change({ days: Number(e.target.value) as ActivityFilters['days'] })} className="block w-full mt-1 border rounded-lg p-2">
          <option value={7}>최근 7일</option><option value={30}>최근 30일</option><option value={90}>최근 90일</option>
        </select>
      </label>
      <label className="text-sm min-w-0">조회 범위
        <select aria-label="조회 범위" value={filters.refrigeratorId ?? ''} onChange={e => change({ refrigeratorId: e.target.value ? Number(e.target.value) : null })} className="block w-full min-w-0 mt-1 border rounded-lg p-2">
          <option value="">내 기록 전체</option>
          {fridges.map(fridge => <option key={fridge.id} value={fridge.id}>{fridge.name} · 가족 전체</option>)}
        </select>
      </label>
      <label className="text-sm">처리 유형
        <select aria-label="처리 유형" value={filters.actionType} onChange={e => change({ actionType: e.target.value as ActivityFilters['actionType'] })} className="block w-full mt-1 border rounded-lg p-2">
          <option value="">소비·폐기 전체</option><option value="CONSUMED">소비만</option><option value="DISPOSED">폐기만</option>
        </select>
      </label>
    </section>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
      <p role="alert" className="text-red-700">{error}</p>
      <div className="flex flex-wrap gap-4"><button className="text-purple-700 underline" onClick={refresh}>다시 불러오기</button>
        {filters.refrigeratorId !== null && <button className="text-purple-700 underline" onClick={() => change({ refrigeratorId: null })}>내 기록으로 돌아가기</button>}
      </div>
    </div>}
    {loading && <p role="status" className="py-8 text-center text-gray-500">기록을 불러오는 중…</p>}
    {data && <>
      <div className="space-y-2">
        <h2 className="text-lg font-bold break-words">{data.scope === 'mine' ? '내 기록 요약' : `${data.refrigerator_name} · 가족 기록 요약`}</h2>
        <p className="text-sm text-gray-500">{data.start_date} ~ {data.end_date} · 한국 시간 · {timeFormat.format(new Date(data.as_of))} 조회 기준</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {[['전체 처리', data.counts.total, 'text-gray-800'], ['소비', data.counts.consumed, 'text-purple-700'], ['폐기', data.counts.disposed, 'text-rose-700']].map(([label, count, color]) => <div key={label} className="bg-white rounded-xl border p-3 sm:p-5">
            <p className="text-sm text-gray-500">{label}</p><p className={`text-2xl sm:text-3xl font-bold mt-2 ${color}`} aria-label={`${label} ${count}건`}>{count}<span className="text-sm font-normal ml-1">건</span></p>
          </div>)}
        </div>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 min-w-0"><ActivityTrend days={data.daily} /></div>
        <section className="bg-white rounded-xl border p-4 sm:p-5 min-w-0" aria-labelledby="frequent-disposals-title">
          <h2 id="frequent-disposals-title" className="text-lg font-bold">자주 폐기한 재료</h2><p className="text-xs text-gray-500 mt-1">폐기 처리 횟수 기준 · 상위 5개</p>
          {data.frequent_disposals.length ? <ol className="mt-4 space-y-3">{data.frequent_disposals.map((item, index) => <li key={item.name} className="flex items-start gap-2 text-sm"><span className="text-gray-400">{index + 1}.</span><span className="flex-1 min-w-0 break-words">{item.name}</span><strong className="text-rose-700 shrink-0">{item.count}건</strong></li>)}</ol> : <p className="text-sm text-gray-500 mt-4">이 조건에 해당하는 폐기 기록이 없습니다.</p>}
        </section>
      </div>
      <section aria-labelledby="activity-list-title" className="space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><h2 id="activity-list-title" className="text-lg font-bold">상세 이력</h2><span className="text-sm text-gray-500">최신순 · 총 {data.counts.total}건 · {cursors.length}페이지</span></div>
        {!data.items.length ? <p className="p-8 bg-white rounded-xl border text-center text-gray-500">이 조건에 해당하는 기록이 없습니다.</p> : <ul className="space-y-3">{data.items.map(item => <li key={item.id} className="bg-white rounded-xl border p-4 sm:p-5 min-w-0">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0">
            <span className={`inline-block text-xs px-2 py-1 rounded-full ${item.action_type === 'CONSUMED' ? 'text-purple-700 bg-purple-50' : 'text-rose-700 bg-rose-50'}`}>{item.action_type === 'CONSUMED' ? '소비' : '폐기'}</span>
            <h3 className="font-bold mt-2 break-words">{item.ingredient_name}</h3></div>
            <p className="font-semibold text-right break-words max-w-[45%]">{quantityFormat.format(item.quantity)} {item.unit}</p></div>
          <p className="text-sm text-gray-600 mt-2 break-words">{item.refrigerator_name}{item.refrigerator_id === null && ' (삭제된 냉장고)'} · {item.actor_name}{item.is_mine && ' (나)'}</p>
          <p className="text-xs text-gray-500 mt-1"><time dateTime={item.created_at}>{timeFormat.format(new Date(item.created_at))}</time> · 한국 시간{item.expiry_date && ` · 당시 ${expiryText(item.expiry_date, item.expiry_source)}`}</p>
          {item.memo && <details className="text-sm mt-3"><summary className="cursor-pointer text-gray-600">메모 보기</summary><p className="whitespace-pre-wrap break-words mt-2 text-gray-700">{item.memo}</p></details>}
        </li>)}</ul>}
      </section>
    </>}
    {cursors.length > 1 || data?.next_cursor ? <div className="flex justify-center items-center gap-5">
      <button disabled={loading || cursors.length === 1} onClick={() => setCursors(old => old.slice(0, -1))} className="border bg-white rounded-lg px-4 py-2 disabled:opacity-40">이전 페이지</button>
      <span className="text-sm">{cursors.length}페이지</span>
      <button disabled={loading || !data?.next_cursor} onClick={() => { if (data?.next_cursor) setCursors(old => [...old, data.next_cursor]) }} className="border bg-white rounded-lg px-4 py-2 disabled:opacity-40">다음 페이지</button>
    </div> : null}
  </div>
}
