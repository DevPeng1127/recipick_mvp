import { useState } from 'react'
import type { StorageType } from '../../types/storage'
import Modal from '../common/Modal'

interface CreateStorageBoxModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string, type: StorageType) => Promise<void>
}

export default function CreateStorageBoxModal({
  isOpen,
  onClose,
  onCreate,
}: CreateStorageBoxModalProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<StorageType>('FRIDGE')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await onCreate(name.trim(), type)
    setName('')
    setType('FRIDGE')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="보관함 추가">
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            보관함 이름
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 야채칸, 음료칸"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            autoFocus
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            보관 유형
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as StorageType)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="FRIDGE">냉장</option>
            <option value="FREEZER">냉동</option>
            <option value="ROOM">실온</option>
          </select>
        </div>
        <div className="flex gap-3 justify-end">
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
            추가
          </button>
        </div>
      </form>
    </Modal>
  )
}
