import { useEffect } from 'react'
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

  useEffect(() => {
    fetchRefrigerators()
  }, [fetchRefrigerators])

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
      <h1 className="text-2xl font-bold text-gray-800 mb-6">AI 레시피 추천</h1>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          레시피를 받을 냉장고 선택
        </label>
        <div className="space-y-2">
          {refrigerators.map((fridge) => (
            <div key={fridge.id} className="flex items-center gap-3">
              <span className="text-gray-800">{fridge.name}</span>
              <RecipeRecommendButton
                onClick={() => fetchRecipe(fridge.id)}
                isLoading={isLoading}
              />
            </div>
          ))}
        </div>
      </div>

      {error && <ErrorMessage message={error} />}
      <RecipeResultCard recipe={recipe} />
    </div>
  )
}
