import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getCookingPreview } from '../api/recipes'
import CookingPanel from '../components/recipe/CookingPanel'
import type { CookingPreview } from '../types/recipe'
import { useRefrigeratorStore } from '../stores/useRefrigeratorStore'
import { useRecipeStore } from '../stores/useRecipeStore'
import MenuSelection from '../components/recipe/MenuSelection'
import RecipeResultCard from '../components/recipe/RecipeResultCard'
import ErrorMessage from '../components/common/ErrorMessage'
import EmptyState from '../components/common/EmptyState'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function RecipePage() {
  const { refrigerators, isLoading: fridgeLoading, error: fridgeError, fetchRefrigerators } = useRefrigeratorStore()
  const { recipe, planId: savedPlanId, isLoading, error, fetchRecipe } = useRecipeStore()
  const [params, setParams] = useSearchParams()
  const planId = params.get('plan') ?? savedPlanId
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
        setPlanError('메뉴 기록을 불러올 수 없습니다. 계정과 냉장고 접근 권한을 확인해 주세요.')
      }
    }).finally(() => { if (active) setPlanLoading(false) })
    return () => { active = false }
  }, [planId])

  useEffect(() => {
    fetchRefrigerators()
  }, [fetchRefrigerators])

  if (fridgeLoading) return <LoadingSpinner />
  if (fridgeError) return <div><ErrorMessage message={fridgeError} /><button onClick={() => { void fetchRefrigerators() }}>냉장고 목록 다시 불러오기</button></div>

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
      <h1 className="text-2xl font-bold text-gray-800 mb-2">AI 메뉴 추천</h1>
      <p className="text-sm text-gray-500 mb-6">냉장고 속 음식으로 오늘 먹을 메뉴를 골라보세요. 완제품은 간편하게, 조리가 필요하면 레시피까지 안내합니다.</p>
      <MenuSelection refrigerators={refrigerators} busy={isLoading}
        onRecommend={async (fridges, servings, priorities) => {
          setPreview(null)
          setParams({}, { replace: true })
          await fetchRecipe(fridges, servings, priorities)
          const id = useRecipeStore.getState().planId
          if (id) setParams({ plan: id }, { replace: true })
        }} />

      {error && <div role="alert"><ErrorMessage message={error} /></div>}
      {planError && <div role="alert"><ErrorMessage message={planError} /></div>}
      {!isLoading && !planLoading && preview && <h2 className="text-xl font-bold mb-3">{preview.title}</h2>}
      {planLoading ? <LoadingSpinner /> : !planError && <RecipeResultCard recipe={recipe} />}
      {!isLoading && !planLoading && preview && <CookingPanel key={preview.plan_id} initial={preview} onRepeat={id => setParams({ plan: id })} />}
    </div>
  )
}
