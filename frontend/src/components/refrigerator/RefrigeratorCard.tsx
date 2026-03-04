import { Link } from 'react-router-dom'
import type { Refrigerator } from '../../types/refrigerator'
import KebabMenu from '../common/KebabMenu'

function getDday(expiryDate: string | null): { label: string; color: string } | null {
  if (!expiryDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  expiry.setHours(0, 0, 0, 0)
  const diff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diff <= 0) return { label: `D${diff === 0 ? '-Day' : `+${Math.abs(diff)}`}`, color: 'text-red-500 bg-red-50' }
  if (diff <= 3) return { label: `D-${diff}`, color: 'text-red-500 bg-red-50' }
  if (diff <= 7) return { label: `D-${diff}`, color: 'text-orange-500 bg-orange-50' }
  return { label: `D-${diff}`, color: 'text-green-600 bg-green-50' }
}

interface RefrigeratorCardProps {
  refrigerator: Refrigerator
  onEdit?: () => void
  onDelete?: () => void
  onToggleFavorite?: () => void
}

export default function RefrigeratorCard({ refrigerator, onEdit, onDelete, onToggleFavorite }: RefrigeratorCardProps) {
  const menuItems = []
  if (onEdit) menuItems.push({ label: '수정', onClick: onEdit })
  if (onDelete) menuItems.push({ label: '삭제', onClick: onDelete, danger: true })

  const topIngredients = refrigerator.top_ingredients ?? []
  const totalCount = refrigerator.total_ingredient_count ?? 0
  const extraCount = totalCount - topIngredients.length

  return (
    <Link
      to={`/refrigerators/${refrigerator.id}`}
      className="block bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition min-h-[200px] relative"
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          {onToggleFavorite && (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggleFavorite()
              }}
              className={`text-lg hover:scale-110 transition-transform ${refrigerator.is_favorite ? 'text-yellow-400' : 'text-gray-300'}`}
              title={refrigerator.is_favorite ? '즐겨찾기 해제' : '즐겨찾기'}
            >
              {refrigerator.is_favorite ? '★' : '☆'}
            </button>
          )}
          <h3 className="font-bold text-lg text-gray-800">{refrigerator.name}</h3>
        </div>
        {menuItems.length > 0 && <KebabMenu items={menuItems} />}
      </div>

      {topIngredients.length === 0 ? (
        <p className="text-sm text-gray-400 mt-3">식재료가 없습니다</p>
      ) : (
        <ul className="space-y-1.5 mt-3">
          {topIngredients.map((ingredient, idx) => {
            const dday = getDday(ingredient.expiry_date)
            return (
              <li key={idx} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 truncate">{ingredient.name}</span>
                {dday ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${dday.color}`}>
                    {dday.label}
                  </span>
                ) : (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-medium text-gray-400 bg-gray-50">
                    기한없음
                  </span>
                )}
              </li>
            )
          })}
          {extraCount > 0 && (
            <li className="text-xs text-gray-400">외 {extraCount}개...</li>
          )}
        </ul>
      )}
    </Link>
  )
}
