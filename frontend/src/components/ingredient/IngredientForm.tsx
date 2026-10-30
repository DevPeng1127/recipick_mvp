import { useState } from 'react'
import type { IngredientCreate, ExpiryValue } from '../../types/ingredient'
import type { StorageType } from '../../types/storage'
import { UNIT_OPTIONS, CUSTOM_UNIT_OPTION } from '../../constants/ingredients'
import { recommendExpiry, todayKst } from '../../constants/expiry'
import ExpiryInput from './ExpiryInput'
import { useToastStore } from '../../stores/useToastStore'

interface IngredientFormProps {
  onSubmit: (data: IngredientCreate) => Promise<void>
  storageType?: StorageType
}

export default function IngredientForm({ onSubmit, storageType }: IngredientFormProps) {
  const [formData, setFormData] = useState<IngredientCreate>({
    name: '',
    quantity: 1,
    unit: '개',
  })
  const [isCustomUnit, setIsCustomUnit] = useState(false)
  const [baseDate, setBaseDate] = useState(todayKst)
  const [manualExpiry, setManualExpiry] = useState<ExpiryValue | null>(null)
  const suggestion = recommendExpiry(formData.name, storageType, baseDate)
  const expiry = manualExpiry ?? suggestion

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({ ...prev, name }))
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
    if (formData.quantity <= 0) {
      useToastStore.getState().addToast('error', '수량은 0보다 커야 합니다.')
      setFormData((prev) => ({ ...prev, quantity: 1 }))
      return
    }
    if (['label', 'estimated'].includes(expiry.expiry_source) && !expiry.expiry_date) {
      useToastStore.getState().addToast('error', '기한 날짜를 입력하거나 기한 미입력을 선택해 주세요.')
      return
    }
    await onSubmit({ ...formData, ...expiry, name: formData.name.trim() })
    setFormData({
      name: '',
      quantity: 1,
      unit: '개',
    })
    setIsCustomUnit(false)
    setManualExpiry(null)
    setBaseDate(todayKst())
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
            setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })
          }
          step="any"
          className="border border-gray-300 rounded-lg px-3 py-2 w-20 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        {isCustomUnit ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              placeholder="단위"
              className="border border-gray-300 rounded-lg px-3 py-2 w-20 focus:outline-none focus:ring-2 focus:ring-purple-500"
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                setIsCustomUnit(false)
                setFormData((prev) => ({ ...prev, unit: '개' }))
              }}
              className="text-xs text-purple-600 border border-purple-300 rounded-lg px-2 py-1 hover:bg-purple-50 whitespace-nowrap"
            >
              목록
            </button>
          </div>
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
        <ExpiryInput value={expiry} onChange={setManualExpiry} suggestion={suggestion} onApplySuggestion={() => setManualExpiry(null)} />
        <button
          type="submit"
          disabled={!formData.name.trim()}
          className="bg-purple-600 text-white rounded-lg px-4 py-2 hover:bg-purple-700 disabled:opacity-50"
        >
          추가
        </button>
      </div>
      {expiry.expiry_source === 'estimated' && <p className="mt-3 text-xs text-gray-500">
        등록 당일의 신선한 원물 기준입니다. 냉장 4℃ 이하·냉동 -18℃ 이하, 실온은 서늘하고 건조한 곳(약 10~16℃)을 전제로 합니다. 구입·개봉 시점이나 보관 상태가 다르면 날짜를 수정해 주세요.
      </p>}
    </form>
  )
}
