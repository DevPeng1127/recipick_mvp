import { useEffect, useState } from 'react'
import type { Ingredient, IngredientUpdate } from '../../types/ingredient'
import { UNIT_OPTIONS, CUSTOM_UNIT_OPTION } from '../../constants/ingredients'
import Modal from '../common/Modal'

interface EditIngredientModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: IngredientUpdate) => Promise<void>
  ingredient: Ingredient | null
}

export default function EditIngredientModal({
  isOpen,
  onClose,
  onSave,
  ingredient,
}: EditIngredientModalProps) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unit, setUnit] = useState('개')
  const [expiryDate, setExpiryDate] = useState('')
  const [isCustomUnit, setIsCustomUnit] = useState(false)

  useEffect(() => {
    if (isOpen && ingredient) {
      setName(ingredient.name)
      setQuantity(ingredient.quantity)
      setUnit(ingredient.unit)
      setExpiryDate(ingredient.expiry_date ?? '')
      setIsCustomUnit(!UNIT_OPTIONS.includes(ingredient.unit as typeof UNIT_OPTIONS[number]))
    }
  }, [isOpen, ingredient])

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
    if (!name.trim()) return
    await onSave({
      name: name.trim(),
      quantity,
      unit,
      expiry_date: expiryDate || null,
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="식재료 수정">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">수량</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              min={1}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">단위</label>
            {isCustomUnit ? (
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="단위"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            ) : (
              <select
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
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">소비기한</label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </form>
    </Modal>
  )
}
