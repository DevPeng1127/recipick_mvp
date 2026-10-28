import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getCookingPreview } from '../api/recipes'
import CookingPanel from '../components/recipe/CookingPanel'
import type { CookingPreview } from '../types/recipe'
import { useRefrigeratorStore } from '../stores/useRefrigeratorStore'
import { useRecipeStore } from '../stores/useRecipeStore'
import RecipeRecommendButton from '../components/recipe/RecipeRecommendButton'
import RecipeResultCard from '../components/recipe/RecipeResultCard'
import ErrorMessage from '../components/common/ErrorMessage'
import EmptyState from '../components/common/EmptyState'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function RecipePage() {
  const { refrigerators, isLoading: fridgeLoading, fetchRefrigerators } = useRefrigeratorStore()
  const { recipe, planId: savedPlanId, isLoading, error, fetchRecipe } = useRecipeStore()
  const [params, setParams] = useSearchParams()
  const planId = params.get('plan') ?? savedPlanId
  const [servings, setServings] = useState(1)
  const [preview, setPreview] = useState<CookingPreview | null>(null)
  const [planError, setPlanError] = useState('')
  const [planLoading, setPlanLoading] = useState(false)
  useEffect(() => {
    if (planId && !params.get('plan')) setParams({ plan: planId }, { replace: true })
  }, [planId, params, setParams])
  useEffect(() => {
    let active = true
    setPreview(null)
    setPlanError('')
    if (!planId) { setPlanLoading(false); return }
    setPlanLoading(true)
    getCookingPreview(planId).then(data => {
      if (active) {
        setPreview(data)
        useRecipeStore.setState({ recipe: data.recipe, planId: data.plan_id, error: null })
      }
    }).catch(() => {
      if (active) {
        useRecipeStore.getState().clearRecipe()
        setPlanError('요리 기록을 불러올 수 없습니다. 계정과 냉장고 접근 권한을 확인해 주세요.')
      }
    }).finally(() => { if (active) setPlanLoading(false) })
    return () => { active = false }
  }, [planId])
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

      <div className="mb-6 space-y-3">
        <label className="block text-sm text-gray-600">몇 인분을 만들까요?
          <select aria-label="인분" value={servings} disabled={isLoading} onChange={e => setServings(Number(e.target.value))} className="ml-3 border rounded-lg p-2">
            {Array.from({ length: 8 }, (_, i) => i + 1).map(count => <option key={count} value={count}>{count}인분</option>)}
          </select>
        </label>
        <RecipeRecommendButton
          onClick={async () => {
            setPreview(null)
            setParams({}, { replace: true })
            await fetchRecipe(Array.from(selectedIds), servings)
            const id = useRecipeStore.getState().planId
            if (id) setParams({ plan: id }, { replace: true })
          }}
          isLoading={isLoading}
          disabled={selectedIds.size === 0}
          selectedCount={selectedIds.size}
        />
      </div>

      {error && <div role="alert"><ErrorMessage message={error} /></div>}
      {planError && <div role="alert"><ErrorMessage message={planError} /></div>}
      {!isLoading && !planLoading && preview && <h2 className="text-xl font-bold mb-3">{preview.title}</h2>}
      {planLoading ? <LoadingSpinner /> : !planError && <RecipeResultCard recipe={recipe} />}
      {!isLoading && !planLoading && preview && <CookingPanel key={preview.plan_id} initial={preview} onRepeat={id => setParams({ plan: id })} />}
    </div>
  )
}
