import type { Ingredient } from '../../types/ingredient'
import ExpiryBadge from './ExpiryBadge'
import KebabMenu from '../common/KebabMenu'

interface IngredientCardProps {
  ingredient: Ingredient
  onEdit?: (ingredient: Ingredient) => void
  onDelete: (id: number) => void
}

export default function IngredientCard({ ingredient, onEdit, onDelete }: IngredientCardProps) {
  const menuItems = []
  if (onEdit) menuItems.push({ label: '수정', onClick: () => onEdit(ingredient) })
  menuItems.push({ label: '삭제', onClick: () => onDelete(ingredient.id), danger: true })

  return (
    <div className="flex items-center justify-between bg-white rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <div>
          <span className="font-medium text-gray-800">{ingredient.name}</span>
          <span className="text-sm text-gray-400 ml-2">{ingredient.quantity}{ingredient.unit}</span>
        </div>
        <ExpiryBadge expiryDate={ingredient.expiry_date} />
      </div>
      <KebabMenu items={menuItems} />
    </div>
  )
}
