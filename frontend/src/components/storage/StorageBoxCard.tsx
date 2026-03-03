import { Link } from 'react-router-dom'
import type { StorageBox } from '../../types/storage'
import KebabMenu from '../common/KebabMenu'

const typeConfig = {
  FRIDGE: { label: '냉장', color: 'bg-green-100 text-green-700' },
  FREEZER: { label: '냉동', color: 'bg-blue-100 text-blue-700' },
  ROOM: { label: '실온', color: 'bg-orange-100 text-orange-700' },
}

interface StorageBoxCardProps {
  storageBox: StorageBox
  onEdit?: () => void
  onDelete?: () => void
}

export default function StorageBoxCard({ storageBox, onEdit, onDelete }: StorageBoxCardProps) {
  const config = typeConfig[storageBox.type]

  const menuItems = []
  if (onEdit) menuItems.push({ label: '수정', onClick: onEdit })
  if (onDelete) menuItems.push({ label: '삭제', onClick: onDelete, danger: true })

  return (
    <Link
      to={`/storage-boxes/${storageBox.id}`}
      className="block bg-white rounded-lg border p-4 hover:shadow-sm transition"
    >
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-gray-800">{storageBox.name}</h4>
          <span className={`text-xs px-2 py-1 rounded-full ${config.color}`}>
            {config.label}
          </span>
        </div>
        {menuItems.length > 0 && <KebabMenu items={menuItems} />}
      </div>
    </Link>
  )
}
