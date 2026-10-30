import type { Ingredient } from '../../types/ingredient'
import ExpiryBadge from './ExpiryBadge'
import KebabMenu from '../common/KebabMenu'

interface IngredientCardProps {
  ingredient: Ingredient
  onEdit?: (ingredient: Ingredient) => void
  onConsume: (ingredient: Ingredient) => void
  onDispose: (ingredient: Ingredient) => void
  selection?: { checked: boolean; disabled: boolean; onToggle: () => void }
}

export default function IngredientCard({ ingredient, onEdit, onConsume, onDispose, selection }: IngredientCardProps) {
  const menuItems = []
  if (onEdit) menuItems.push({ label: '수정/삭제', onClick: () => onEdit(ingredient) })
  menuItems.push({ label: '소비', onClick: () => onConsume(ingredient) })
  menuItems.push({ label: '폐기', onClick: () => onDispose(ingredient), danger: true })

  return (
    <div className={`flex items-center gap-3 bg-white rounded-lg border p-3 ${selection?.checked ? 'border-purple-400 bg-purple-50' : ''}`}>
      {selection && <input type="checkbox" aria-label={`${ingredient.name} 선택`} checked={selection.checked}
        disabled={selection.disabled} onChange={selection.onToggle} className="h-5 w-5 shrink-0 accent-purple-600" />}
      <div className="flex flex-1 min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 break-words">
          <span className="font-medium text-gray-800">{ingredient.name}</span>
          <span className="text-sm text-gray-400 ml-2">{ingredient.quantity}{ingredient.unit}</span>
        </div>
        <ExpiryBadge expiryDate={ingredient.expiry_date} />
      </div>
      {!selection && <KebabMenu items={menuItems} />}
    </div>
  )
}
