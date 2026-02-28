import { Link } from 'react-router-dom'
import type { StorageBox } from '../../types/storage'

const typeConfig = {
  FRIDGE: { label: '냉장', color: 'bg-green-100 text-green-700' },
  FREEZER: { label: '냉동', color: 'bg-blue-100 text-blue-700' },
  ROOM: { label: '실온', color: 'bg-orange-100 text-orange-700' },
}

interface StorageBoxCardProps {
  storageBox: StorageBox
}

export default function StorageBoxCard({ storageBox }: StorageBoxCardProps) {
  const config = typeConfig[storageBox.type]

  return (
    <Link
      to={`/storage-boxes/${storageBox.id}`}
      className="block bg-white rounded-lg border p-4 hover:shadow-sm transition"
    >
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-gray-800">{storageBox.name}</h4>
        <span className={`text-xs px-2 py-1 rounded-full ${config.color}`}>
          {config.label}
        </span>
      </div>
    </Link>
  )
}
