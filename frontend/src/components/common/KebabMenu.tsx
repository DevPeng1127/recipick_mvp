import { useEffect, useRef, useState } from 'react'

interface KebabMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
}

interface KebabMenuProps {
  items: KebabMenuItem[]
}

export default function KebabMenu({ items }: KebabMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(!open)
        }}
        className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-8 bg-white border rounded-lg shadow-lg py-1 z-50 min-w-[100px]">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                item.onClick()
                setOpen(false)
              }}
              className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                item.danger ? 'text-red-500' : 'text-gray-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
