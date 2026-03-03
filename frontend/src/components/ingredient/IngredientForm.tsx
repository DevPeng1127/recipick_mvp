import { useRef, useState } from 'react'
import type { IngredientCreate } from '../../types/ingredient'
import { UNIT_OPTIONS, CUSTOM_UNIT_OPTION, getExpiryDate } from '../../constants/ingredients'

interface IngredientFormProps {
  onSubmit: (data: IngredientCreate) => Promise<void>
}

export default function IngredientForm({ onSubmit }: IngredientFormProps) {
  const [formData, setFormData] = useState<IngredientCreate>({
    name: '',
    quantity: 1,
    unit: '개',
    expiry_date: getExpiryDate(''),
  })
  const [isCustomUnit, setIsCustomUnit] = useState(false)
  const isExpiryManuallySet = useRef(false)

  const handleNameChange = (name: string) => {
    const update: Partial<IngredientCreate> = { name }
    if (!isExpiryManuallySet.current) {
      update.expiry_date = getExpiryDate(name.trim())
    }
    setFormData((prev) => ({ ...prev, ...update }))
  }

  const handleUnitSelect = (value: string) => {
    if (value === CUSTOM_UNIT_OPTION) {
      setIsCustomUnit(true)
      setFormData((prev) => ({ ...prev, unit: '' }))
    } else {
      setIsCustomUnit(false)
      setFormData((prev) => ({ ...prev, unit: value }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return
    await onSubmit({ ...formData, name: formData.name.trim() })
    setFormData({
      name: '',
      quantity: 1,
      unit: '개',
      expiry_date: getExpiryDate(''),
    })
    setIsCustomUnit(false)
    isExpiryManuallySet.current = false
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-4">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_1fr_auto] gap-3 items-end">
        <input
          type="text"
          value={formData.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="식재료 이름"
          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <input
          type="number"
          value={formData.quantity}
          onChange={(e) =>
            setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })
          }
          min={1}
          className="border border-gray-300 rounded-lg px-3 py-2 w-20 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        {isCustomUnit ? (
          <input
            type="text"
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            placeholder="단위"
            className="border border-gray-300 rounded-lg px-3 py-2 w-24 focus:outline-none focus:ring-2 focus:ring-purple-500"
            autoFocus
          />
        ) : (
          <select
            value={formData.unit}
            onChange={(e) => handleUnitSelect(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 w-24 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
            <option value={CUSTOM_UNIT_OPTION}>{CUSTOM_UNIT_OPTION}</option>
          </select>
        )}
        <input
          type="date"
          value={formData.expiry_date || ''}
          onChange={(e) => {
            isExpiryManuallySet.current = true
            setFormData({ ...formData, expiry_date: e.target.value || null })
          }}
          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          type="submit"
          disabled={!formData.name.trim()}
          className="bg-purple-600 text-white rounded-lg px-4 py-2 hover:bg-purple-700 disabled:opacity-50"
        >
          추가
        </button>
      </div>
    </form>
  )
}
