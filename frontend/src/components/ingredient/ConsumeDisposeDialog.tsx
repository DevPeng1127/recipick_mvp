import { useRef, useState } from 'react'
import Modal from '../common/Modal'
import type { Ingredient, ConsumeDisposeRequest } from '../../types/ingredient'

type ActionType = 'consume' | 'dispose'

interface ConsumeDisposeDialogProps {
  isOpen: boolean
  onClose: () => void
  ingredient: Ingredient | null
  actionType: ActionType
  onConfirm: (data: ConsumeDisposeRequest) => Promise<void>
}

export default function ConsumeDisposeDialog({
  isOpen,
  onClose,
  ingredient,
  actionType,
  onConfirm,
}: ConsumeDisposeDialogProps) {
  const [mode, setMode] = useState<'all' | 'partial'>('all')
  const [quantity, setQuantity] = useState('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)

  const isConsume = actionType === 'consume'
  const title = isConsume ? '식재료 소비' : '식재료 폐기'
  const buttonLabel = isConsume ? '소비하기' : '폐기하기'
  const buttonColor = isConsume
    ? 'bg-green-500 hover:bg-green-600'
    : 'bg-red-500 hover:bg-red-600'

  const resetInputs = () => {
    setMode('all')
    setQuantity('')
    setMemo('')
    setError('')
  }

  const handleClose = () => {
    if (submittingRef.current) return
    resetInputs()
    onClose()
  }

  const handleSubmit = async () => {
    if (submittingRef.current) return
    let requestedQuantity: number | null = null
    if (mode === 'partial') {
      const qty = parseFloat(quantity)
      if (!Number.isFinite(qty) || qty <= 0) {
        setError('수량은 0보다 커야 합니다')
        return
      }
      if (ingredient && qty > ingredient.quantity) {
        setError(`현재 수량(${ingredient.quantity}${ingredient.unit})보다 클 수 없습니다`)
        return
      }
      requestedQuantity = qty
    }

    // Lock immediately, including clicks before React renders the disabled state.
    submittingRef.current = true
    setIsSubmitting(true)
    setError('')
    try {
      await onConfirm({ quantity: requestedQuantity, memo: memo || null })
      resetInputs()
      onClose()
    } catch {
      setError(`${isConsume ? '소비' : '폐기'} 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.`)
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  if (!ingredient) return null

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} closeDisabled={isSubmitting}>
      <fieldset disabled={isSubmitting} aria-busy={isSubmitting} className="space-y-4">
        <div>
          <p className="text-sm text-gray-600 mb-1">
            <span className="font-medium text-gray-800">{ingredient.name}</span>
            {' '}({ingredient.quantity}{ingredient.unit})
          </p>
        </div>

        {/* 전부/수량지정 탭 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setMode('all'); setError('') }}
            className={`flex-1 py-2 text-sm rounded-lg border ${
              mode === 'all'
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            전부
          </button>
          <button
            type="button"
            onClick={() => { setMode('partial'); setError('') }}
            className={`flex-1 py-2 text-sm rounded-lg border ${
              mode === 'partial'
                ? 'bg-gray-800 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            수량 지정
          </button>
        </div>

        {/* 수량 입력 */}
        {mode === 'partial' && (
          <div>
            <label className="block text-sm text-gray-600 mb-1">수량</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => { setQuantity(e.target.value); setError('') }}
                placeholder="0"
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <span className="text-sm text-gray-500">{ingredient.unit}</span>
            </div>
          </div>
        )}

        {/* 메모 */}
        <div>
          <label className="block text-sm text-gray-600 mb-1">메모 (선택)</label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="예: 유통기한 지남"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        {/* 확인 버튼 */}
        <button
          type="button"
          onClick={handleSubmit}
          className={`w-full py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${buttonColor}`}
        >
          {isSubmitting ? '처리 중...' : buttonLabel}
        </button>
      </fieldset>
    </Modal>
  )
}
