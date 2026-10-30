import ExpiryInput from './ExpiryInput'
import { useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import type { Ingredient, IngredientUpdate, ExpirySource } from '../../types/ingredient'
import { UNIT_OPTIONS, CUSTOM_UNIT_OPTION } from '../../constants/ingredients'
import Modal from '../common/Modal'
import { useToastStore } from '../../stores/useToastStore'

interface EditIngredientModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: IngredientUpdate) => Promise<void>
  onDelete: () => Promise<void>
  ingredient: Ingredient | null
}

export default function EditIngredientModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  ingredient,
}: EditIngredientModalProps) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unit, setUnit] = useState('개')
  const [expiryDate, setExpiryDate] = useState('')
  const [expirySource, setExpirySource] = useState<ExpirySource>('unknown')
  const [isCustomUnit, setIsCustomUnit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    if (isOpen && ingredient) {
      setConfirmDelete(false)
      setError('')
      setName(ingredient.name)
      setQuantity(ingredient.quantity)
      setUnit(ingredient.unit)
      setExpiryDate(ingredient.expiry_date ?? '')
      setExpirySource(ingredient.expiry_source ?? 'unknown')
      setIsCustomUnit(!UNIT_OPTIONS.includes(ingredient.unit as typeof UNIT_OPTIONS[number]))
    }
  }, [isOpen, ingredient])

  const handleClose = () => {
    if (!busyRef.current) onClose()
  }

  async function perform(action: 'save' | 'delete') {
    if (!ingredient || busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try {
      if (action === 'delete') await onDelete()
      else await onSave({ name: name.trim(), quantity, unit: unit.trim(), expiry_date: expiryDate || null, expiry_source: expirySource })
      if (mounted.current) {
        useToastStore.getState().addToast('success', action === 'delete' ? '식재료가 삭제되었습니다. 소비·폐기 통계에는 반영되지 않습니다.' : '식재료가 수정되었습니다.')
        onClose()
      }
    } catch (reason) {
      if (!mounted.current) return
      const status = isAxiosError(reason) ? reason.response?.status : undefined
      setError(status === 403 ? '이 냉장고의 식재료를 변경할 권한이 없습니다.'
        : status === 404 ? '보관함이나 식재료를 찾을 수 없습니다. 창을 닫고 목록을 새로고침해 주세요.'
          : action === 'delete' ? '삭제 완료를 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.'
            : '수정하지 못했습니다. 입력값과 연결 상태를 확인해 주세요.')
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }

  const handleUnitSelect = (value: string) => {
    if (value === CUSTOM_UNIT_OPTION) {
      setIsCustomUnit(true)
      setUnit('')
    } else {
      setIsCustomUnit(false)
      setUnit(value)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busyRef.current || confirmDelete || !name.trim() || !unit.trim()) return
    if (!Number.isFinite(quantity) || quantity <= 0) {
      useToastStore.getState().addToast('error', '수량은 0보다 커야 합니다.')
      setQuantity(1)
      return
    }
    if (['label', 'estimated'].includes(expirySource) && !expiryDate) { setError('기한 날짜를 입력하거나 기한 미입력을 선택해 주세요.'); return }
    await perform('save')
  }

  if (!ingredient) return null

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={confirmDelete ? '식재료 삭제 확인' : '식재료 수정'} closeDisabled={busy}>
      {confirmDelete ? <fieldset disabled={busy} aria-busy={busy} className="space-y-4">
        <p className="break-words text-gray-800"><strong>{ingredient.name}</strong> ({ingredient.quantity}{ingredient.unit}) 항목을 삭제할까요?</p>
        <p className="text-sm text-gray-600">입력 실수나 중복 등록을 정리할 때 사용하세요. 이 재고는 삭제 후 복구할 수 없습니다.</p>
        <p className="text-sm text-gray-600">새 소비·폐기 기록을 만들지 않으며, 기존 소비·폐기 이력은 유지됩니다. 가족과 공유하는 재고에서도 제거됩니다.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" autoFocus onClick={() => { setConfirmDelete(false); setError('') }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-600">돌아가기</button>
          <button type="button" onClick={() => { void perform('delete') }}
            className="rounded-lg bg-red-600 px-4 py-2 text-white disabled:opacity-50">{busy ? '삭제 중...' : '삭제하기'}</button>
        </div>
      </fieldset> : <>
      <form onSubmit={handleSubmit} className="space-y-3">
        <fieldset disabled={busy} aria-busy={busy} className="space-y-3">
        <div>
          <label htmlFor="edit-ingredient-name" className="block text-sm font-medium text-gray-700 mb-1">이름</label>
          <input
            id="edit-ingredient-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <label htmlFor="edit-ingredient-quantity" className="block text-sm font-medium text-gray-700 mb-1">수량</label>
            <input
              id="edit-ingredient-quantity"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              step="any"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label htmlFor="edit-ingredient-unit" className="block text-sm font-medium text-gray-700 mb-1">단위</label>
            {isCustomUnit ? (
              <div className="flex gap-1">
                <input
                  id="edit-ingredient-unit"
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="단위"
                  className="min-w-0 flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomUnit(false)
                    setUnit('개')
                  }}
                  className="text-xs text-purple-600 border border-purple-300 rounded-lg px-2 py-1 hover:bg-purple-50 whitespace-nowrap"
                >
                  목록
                </button>
              </div>
            ) : (
              <select
                id="edit-ingredient-unit"
                value={unit}
                onChange={(e) => handleUnitSelect(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
                <option value={CUSTOM_UNIT_OPTION}>{CUSTOM_UNIT_OPTION}</option>
              </select>
            )}
          </div>
        </div>
        <ExpiryInput value={{ expiry_date: expiryDate || null, expiry_source: expirySource }}
          onChange={value => { setExpiryDate(value.expiry_date ?? ''); setExpirySource(value.expiry_source) }} />
        <p className="text-xs text-gray-500">기존 기한은 자동으로 다시 계산하지 않습니다.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim() || !unit.trim()}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {busy ? '저장 중...' : '저장'}
          </button>
        </div>
        </fieldset>
      </form>
      <div className="mt-5 border-t border-gray-100 pt-4">
        <button type="button" disabled={busy} onClick={() => { setConfirmDelete(true); setError('') }}
          className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50">식재료 삭제</button>
        <p className="mt-1 text-xs text-gray-500">입력 실수·중복 등록을 정리합니다. 폐기 통계에 포함되지 않습니다.</p>
      </div>
      </>}
    </Modal>
  )
}
