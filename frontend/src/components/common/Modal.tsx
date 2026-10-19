import type { ReactNode } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  closeDisabled?: boolean
}

export default function Modal({ isOpen, onClose, title, children, closeDisabled = false }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={closeDisabled ? undefined : onClose} />
      <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            disabled={closeDisabled}
            className="text-gray-400 hover:text-gray-600 text-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
