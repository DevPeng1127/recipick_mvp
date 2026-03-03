import { Link } from 'react-router-dom'
import type { Refrigerator } from '../../types/refrigerator'
import KebabMenu from '../common/KebabMenu'

const typeColorMap = {
  FRIDGE: 'bg-green-400',
  FREEZER: 'bg-blue-400',
  ROOM: 'bg-orange-400',
} as const

interface RefrigeratorCardProps {
  refrigerator: Refrigerator
  onEdit?: () => void
  onDelete?: () => void
}

export default function RefrigeratorCard({ refrigerator, onEdit, onDelete }: RefrigeratorCardProps) {
  const boxes = refrigerator.storage_boxes ?? []

  const menuItems = []
  if (onEdit) menuItems.push({ label: '수정', onClick: onEdit })
  if (onDelete) menuItems.push({ label: '삭제', onClick: onDelete, danger: true })

  return (
    <Link
      to={`/refrigerators/${refrigerator.id}`}
      className="block bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition min-h-[200px] relative"
    >
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-lg text-gray-800 mb-3">{refrigerator.name}</h3>
        {menuItems.length > 0 && <KebabMenu items={menuItems} />}
      </div>

      {boxes.length === 0 ? (
        <p className="text-sm text-gray-400">보관함이 없습니다</p>
      ) : (
        <ul className="space-y-1.5">
          {boxes.map((box) => (
            <li key={box.id} className="flex items-center gap-2 text-sm text-gray-600">
              <span className={`w-2.5 h-2.5 rounded-full ${typeColorMap[box.type]}`} />
              {box.name}
            </li>
          ))}
        </ul>
      )}
    </Link>
  )
}
