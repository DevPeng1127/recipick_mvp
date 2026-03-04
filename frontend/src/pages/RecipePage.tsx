import { useEffect, useState } from 'react'
import { useRefrigeratorStore } from '../stores/useRefrigeratorStore'
import { useRecipeStore } from '../stores/useRecipeStore'
import RecipeRecommendButton from '../components/recipe/RecipeRecommendButton'
import RecipeResultCard from '../components/recipe/RecipeResultCard'
import ErrorMessage from '../components/common/ErrorMessage'
import EmptyState from '../components/common/EmptyState'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function RecipePage() {
  const { refrigerators, isLoading: fridgeLoading, fetchRefrigerators } = useRefrigeratorStore()
  const { recipe, isLoading, error, fetchRecipe } = useRecipeStore()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetchRefrigerators()
  }, [fetchRefrigerators])

  const toggleSelection = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (fridgeLoading) return <LoadingSpinner />

  if (refrigerators.length === 0) {
    return (
      <EmptyState
        icon="🧊"
        title="냉장고가 없습니다"
        description="먼저 냉장고를 추가해주세요"
      />
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">AI 레시피 추천</h1>
      <p className="text-sm text-gray-500 mb-6">레시피를 받을 냉장고를 선택하세요</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {refrigerators.map((fridge) => {
          const isSelected = selectedIds.has(fridge.id)
          return (
            <button
              key={fridge.id}
              onClick={() => toggleSelection(fridge.id)}
              className={`p-4 rounded-xl border-2 text-left transition ${
                isSelected
                  ? 'bg-purple-50 border-purple-300'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {isSelected && <span className="text-purple-600 font-bold">✓</span>}
                <span className="font-medium text-gray-800">{fridge.name}</span>
              </div>
              <p className="text-xs text-gray-400">
                {fridge.total_ingredient_count > 0
                  ? `식재료 ${fridge.total_ingredient_count}개`
                  : '식재료 없음'}
              </p>
            </button>
          )
        })}
      </div>

      <div className="mb-6">
        <RecipeRecommendButton
          onClick={() => fetchRecipe(Array.from(selectedIds))}
          isLoading={isLoading}
          disabled={selectedIds.size === 0}
          selectedCount={selectedIds.size}
        />
      </div>

      {error && <ErrorMessage message={error} />}
      <RecipeResultCard recipe={recipe} />
    </div>
  )
}
