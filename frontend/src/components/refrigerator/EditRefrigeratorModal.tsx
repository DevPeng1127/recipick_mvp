import { useEffect, useState } from 'react'
import Modal from '../common/Modal'

interface EditRefrigeratorModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string) => Promise<void>
  currentName: string
}

export default function EditRefrigeratorModal({
  isOpen,
  onClose,
  onSave,
  currentName,
}: EditRefrigeratorModalProps) {
  const [name, setName] = useState(currentName)

  useEffect(() => {
    if (isOpen) setName(currentName)
  }, [isOpen, currentName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await onSave(name.trim())
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="냉장고 이름 수정">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="냉장고 이름"
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
            저장
          </button>
        </div>
      </form>
    </Modal>
  )
}
