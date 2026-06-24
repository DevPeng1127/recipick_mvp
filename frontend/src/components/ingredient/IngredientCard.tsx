import type { Ingredient } from '../../types/ingredient'
import ExpiryBadge from './ExpiryBadge'
import KebabMenu from '../common/KebabMenu'

interface IngredientCardProps {
  ingredient: Ingredient
  onEdit?: (ingredient: Ingredient) => void
  onConsume: (ingredient: Ingredient) => void
  onDispose: (ingredient: Ingredient) => void
}

export default function IngredientCard({ ingredient, onEdit, onConsume, onDispose }: IngredientCardProps) {
  const menuItems = []
  if (onEdit) menuItems.push({ label: '수정', onClick: () => onEdit(ingredient) })
  menuItems.push({ label: '소비', onClick: () => onConsume(ingredient) })
  menuItems.push({ label: '폐기', onClick: () => onDispose(ingredient), danger: true })

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
