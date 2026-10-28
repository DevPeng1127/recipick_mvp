import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useIngredientStore } from '../stores/useIngredientStore'
import IngredientForm from '../components/ingredient/IngredientForm'
import IngredientList from '../components/ingredient/IngredientList'
import EditIngredientModal from '../components/ingredient/EditIngredientModal'
import ConsumeDisposeDialog from '../components/ingredient/ConsumeDisposeDialog'
import IngredientImportPanel from '../components/ingredient/IngredientImportPanel'
import { createIngredientsBatch } from '../api/receiptImport'
import { useToastStore } from '../stores/useToastStore'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorMessage from '../components/common/ErrorMessage'
import type { Ingredient, ConsumeDisposeRequest } from '../types/ingredient'

type ActionType = 'consume' | 'dispose'

export default function StorageBoxPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const storageBoxId = Number(id)
  const currentBox = useRef(storageBoxId)

  const {
    ingredients,
    isLoading,
    error,
    fetchByStorageBox,
    addIngredient,
    editIngredient,
    consumeIngredient,
    disposeIngredient,
  } = useIngredientStore()

  const [editTarget, setEditTarget] = useState<Ingredient | null>(null)
  const [consumeDisposeTarget, setConsumeDisposeTarget] = useState<Ingredient | null>(null)
  const [actionType, setActionType] = useState<ActionType>('consume')
  const [importMode, setImportMode] = useState<'receipt' | 'voice' | null>(null)

  useEffect(() => {
    currentBox.current = storageBoxId
    setImportMode(null)
    fetchByStorageBox(storageBoxId)
    return () => { currentBox.current = NaN }
  }, [storageBoxId, fetchByStorageBox])

  const handleConsume = (ingredient: Ingredient) => {
    setConsumeDisposeTarget(ingredient)
    setActionType('consume')
  }

  const handleDispose = (ingredient: Ingredient) => {
    setConsumeDisposeTarget(ingredient)
    setActionType('dispose')
  }

  const handleConfirmAction = async (data: ConsumeDisposeRequest) => {
    if (!consumeDisposeTarget) return
    if (actionType === 'consume') {
      await consumeIngredient(storageBoxId, consumeDisposeTarget.id, data)
    } else {
      await disposeIngredient(storageBoxId, consumeDisposeTarget.id, data)
    }
  }

  if (isLoading) return <LoadingSpinner />

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-gray-400 hover:text-gray-600 mb-1"
        >
          &larr; 돌아가기
        </button>
        <h1 className="text-2xl font-bold text-gray-800">식재료 관리</h1>
      </div>

      {error && <ErrorMessage message={error} />}

      {!error && (
        <>
          {!importMode && (
            <div className="mb-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => setImportMode('receipt')}
                className="rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-purple-700 hover:bg-purple-100">
                영수증으로 등록
              </button>
              <button type="button" onClick={() => setImportMode('voice')}
                className="rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-purple-700 hover:bg-purple-100">
                음성으로 등록
              </button>
            </div>
          )}
          {importMode && <IngredientImportPanel key={`${storageBoxId}-${importMode}`} mode={importMode} storageBoxId={storageBoxId}
            onClose={() => { setImportMode(null); void fetchByStorageBox(storageBoxId) }}
            onSave={async items => {
              const created = await createIngredientsBatch(storageBoxId, items)
              if (currentBox.current !== storageBoxId) return
              useIngredientStore.setState(state => ({ ingredients: [...state.ingredients, ...created] }))
              useToastStore.getState().addToast('success', `${created.length}개 식재료가 등록되었습니다.`)
            }} />}
          <div className="mb-4">
            <IngredientForm
              onSubmit={async (data) => {
                await addIngredient(storageBoxId, data)
              }}
            />
          </div>

          <IngredientList
            ingredients={ingredients}
            onConsume={handleConsume}
            onDispose={handleDispose}
            onEdit={(ingredient) => setEditTarget(ingredient)}
          />

          <EditIngredientModal
            isOpen={!!editTarget}
            onClose={() => setEditTarget(null)}
            ingredient={editTarget}
            onSave={async (data) => {
              if (editTarget) {
                await editIngredient(storageBoxId, editTarget.id, data)
              }
            }}
          />

          <ConsumeDisposeDialog
            isOpen={!!consumeDisposeTarget}
            onClose={() => setConsumeDisposeTarget(null)}
            ingredient={consumeDisposeTarget}
            actionType={actionType}
            onConfirm={handleConfirmAction}
          />
        </>
      )}
    </div>
  )
}
