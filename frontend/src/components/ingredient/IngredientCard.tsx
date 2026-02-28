import type { Ingredient } from '../../types/ingredient'
import ExpiryBadge from './ExpiryBadge'

interface IngredientCardProps {
  ingredient: Ingredient
  onDelete: (id: number) => void
}

export default function IngredientCard({ ingredient, onDelete }: IngredientCardProps) {
  return (
    <div className="flex items-center justify-between bg-white rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <div>
          <span className="font-medium text-gray-800">{ingredient.name}</span>
          <span className="text-sm text-gray-400 ml-2">{ingredient.quantity}개</span>
        </div>
        <ExpiryBadge expiryDate={ingredient.expiry_date} />
      </div>
      <button
        onClick={() => onDelete(ingredient.id)}
        className="text-gray-400 hover:text-red-500 text-sm"
      >
        삭제
      </button>
    </div>
  )
}
