import type { Ingredient } from '../../types/ingredient'
import EmptyState from '../common/EmptyState'
import IngredientCard from './IngredientCard'

interface IngredientListProps {
  ingredients: Ingredient[]
  onDelete: (id: number) => void
}

export default function IngredientList({ ingredients, onDelete }: IngredientListProps) {
  if (ingredients.length === 0) {
    return (
      <EmptyState
        icon="🥬"
        title="식재료가 없습니다"
        description="위의 폼으로 식재료를 추가해보세요"
      />
    )
  }

  return (
    <div className="space-y-2">
      {ingredients.map((ingredient) => (
        <IngredientCard
          key={ingredient.id}
          ingredient={ingredient}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
