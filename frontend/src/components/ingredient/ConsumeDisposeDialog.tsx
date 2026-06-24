import { useState } from 'react'
import Modal from '../common/Modal'
import type { Ingredient, ConsumeDisposeRequest } from '../../types/ingredient'

type ActionType = 'consume' | 'dispose'

interface ConsumeDisposeDialogProps {
  isOpen: boolean
  onClose: () => void
  ingredient: Ingredient | null
  actionType: ActionType
  onConfirm: (data: ConsumeDisposeRequest) => void
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

  const isConsume = actionType === 'consume'
  const title = isConsume ? '식재료 소비' : '식재료 폐기'
  const buttonLabel = isConsume ? '소비하기' : '폐기하기'
  const buttonColor = isConsume
    ? 'bg-green-500 hover:bg-green-600'
    : 'bg-red-500 hover:bg-red-600'

  const handleClose = () => {
    setMode('all')
    setQuantity('')
    setMemo('')
    setError('')
    onClose()
  }

  const handleSubmit = () => {
    if (mode === 'partial') {
      const qty = parseFloat(quantity)
      if (isNaN(qty) || qty <= 0) {
        setError('수량은 0보다 커야 합니다')
        return
      }
      if (ingredient && qty > ingredient.quantity) {
        setError(`현재 수량(${ingredient.quantity}${ingredient.unit})보다 클 수 없습니다`)
        return
      }
      onConfirm({ quantity: qty, memo: memo || null })
    } else {
      onConfirm({ quantity: null, memo: memo || null })
    }
    handleClose()
  }

  if (!ingredient) return null

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="space-y-4">
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
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
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

        {/* 확인 버튼 */}
        <button
          type="button"
          onClick={handleSubmit}
          className={`w-full py-2.5 text-white rounded-lg text-sm font-medium ${buttonColor}`}
        >
          {buttonLabel}
        </button>
      </div>
    </Modal>
  )
}
