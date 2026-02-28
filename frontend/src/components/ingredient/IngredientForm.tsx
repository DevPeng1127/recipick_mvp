import { useState } from 'react'
import type { IngredientCreate } from '../../types/ingredient'

interface IngredientFormProps {
  onSubmit: (data: IngredientCreate) => Promise<void>
}

export default function IngredientForm({ onSubmit }: IngredientFormProps) {
  const [formData, setFormData] = useState<IngredientCreate>({
    name: '',
    quantity: 1,
    expiry_date: new Date().toISOString().split('T')[0],
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return
    await onSubmit({ ...formData, name: formData.name.trim() })
    setFormData({
      name: '',
      quantity: 1,
      expiry_date: new Date().toISOString().split('T')[0],
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border p-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
          className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <input
          type="date"
          value={formData.expiry_date || ''}
          onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value || null })}
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
