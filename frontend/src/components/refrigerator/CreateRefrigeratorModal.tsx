import { useState } from 'react'
import Modal from '../common/Modal'

interface CreateRefrigeratorModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<void>
}

export default function CreateRefrigeratorModal({
  isOpen,
  onClose,
  onCreate,
}: CreateRefrigeratorModalProps) {
  const [name, setName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await onCreate(name.trim())
    setName('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="냉장고 추가">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 우리집 냉장고"
          className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
          autoFocus
        />
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
