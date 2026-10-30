import type { Ingredient } from '../../types/ingredient'
import EmptyState from '../common/EmptyState'
import IngredientCard from './IngredientCard'

interface IngredientListProps {
  ingredients: Ingredient[]
  onConsume: (ingredient: Ingredient) => void
  onDispose: (ingredient: Ingredient) => void
  onEdit?: (ingredient: Ingredient) => void
  selection?: { ids: Set<number>; disabled: boolean; limit: number; onToggle: (id: number) => void }
}

export default function IngredientList({ ingredients, onConsume, onDispose, onEdit, selection }: IngredientListProps) {
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
          onConsume={onConsume}
          onDispose={onDispose}
          onEdit={onEdit}
          selection={selection ? {
            checked: selection.ids.has(ingredient.id),
            disabled: selection.disabled || (!selection.ids.has(ingredient.id) && selection.ids.size >= selection.limit),
            onToggle: () => selection.onToggle(ingredient.id),
          } : undefined}
        />
      ))}
    </div>
  )
}
