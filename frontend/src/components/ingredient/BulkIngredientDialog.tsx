import { useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import Modal from '../common/Modal'
import { useToastStore } from '../../stores/useToastStore'
import type { BulkIngredientAction, BulkIngredientActionRequest, Ingredient } from '../../types/ingredient'

interface Props {
  action: BulkIngredientAction
  ingredients: Ingredient[]
  onConfirm: (data: BulkIngredientActionRequest) => Promise<void>
  onClose: () => void
  onRefresh: () => void
  onComplete: () => void
}

export default function BulkIngredientDialog({ action, ingredients, onConfirm, onClose, onRefresh, onComplete }: Props) {
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [mustRefresh, setMustRefresh] = useState(false)
  const pending = useRef(false)
  const mounted = useRef(true)
  const label = action === 'dispose' ? '폐기' : '삭제'
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function submit() {
    if (pending.current || mustRefresh || !ingredients.length) return
    pending.current = true; setBusy(true); setError('')
    try {
      await onConfirm({ action, items: ingredients.map(({ id, name, quantity, unit, expiry_date }) => (
        { id, name, quantity, unit, expiry_date }
      )), ...(action === 'dispose' ? { memo: memo.trim() || null } : {}) })
      if (mounted.current) {
        useToastStore.getState().addToast('success', `식재료 ${ingredients.length}개를 ${label}했습니다.`)
        onComplete()
      }
    } catch (reason) {
      if (!mounted.current) return
      const status = isAxiosError(reason) ? reason.response?.status : undefined
      setMustRefresh(true)
      setError(status === 409 ? '선택한 식재료가 변경되어 처리하지 않았습니다. 목록을 새로고침하고 다시 선택해 주세요.'
        : status === 403 ? '이 냉장고의 식재료를 변경할 권한이 없습니다. 목록을 새로고침해 주세요.'
          : status === 404 ? '보관함을 찾을 수 없습니다. 목록을 새로고침해 주세요.'
            : status === 422 ? '선택한 항목을 확인할 수 없습니다. 목록을 새로고침하고 다시 선택해 주세요.'
              : '처리 완료를 확인하지 못했습니다. 중복 처리를 막기 위해 목록을 새로고침하고 남은 재고와 마이페이지 이력을 확인해 주세요.')
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return <Modal isOpen title={`선택한 ${ingredients.length}개 ${label} 확인`} closeDisabled={busy}
    onClose={() => { if (!pending.current) onClose() }}>
    <fieldset disabled={busy} aria-busy={busy} className="space-y-4 max-h-[65dvh] overflow-y-auto">
      <p className="text-sm text-gray-700">{action === 'dispose'
        ? '선택한 식재료의 남은 수량 전체를 폐기합니다. 각 식재료의 수량이 폐기 이력과 통계에 기록됩니다. 일부만 폐기하려면 개별 폐기를 이용해 주세요.'
        : '입력 실수·중복 등록을 정리합니다. 새 소비·폐기 기록을 만들지 않으며 기존 이력은 유지됩니다.'}</p>
      <ul aria-label="처리할 식재료" className="max-h-[20dvh] overflow-y-auto divide-y rounded-lg border px-3 text-sm">
        {ingredients.map(item => <li key={item.id} className="flex justify-between gap-3 py-2">
          <span className="min-w-0 break-words">{item.name}</span>
          <span className="shrink-0 text-gray-500">{item.quantity}{item.unit}</span>
        </li>)}
      </ul>
      <p className="text-sm text-gray-600">가족과 공유하는 재고에서도 제거되며, 처리 후 복구할 수 없습니다.</p>
      {action === 'dispose' && <div>
        <label htmlFor="bulk-dispose-memo" className="block text-sm text-gray-600 mb-1">공통 메모 (선택)</label>
        <input id="bulk-dispose-memo" value={memo} onChange={event => setMemo(event.target.value)} maxLength={500}
          placeholder="예: 냉장고 정리, 유통기한 지남" className="w-full border rounded-lg px-3 py-2 text-sm" />
      </div>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" autoFocus onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">돌아가기</button>
        {mustRefresh ? <button type="button" onClick={onRefresh} className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-white">목록 새로고침</button>
          : <button type="button" onClick={() => { void submit() }} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? '처리 중...' : `${ingredients.length}개 ${label}하기`}
          </button>}
      </div>
    </fieldset>
  </Modal>
}
