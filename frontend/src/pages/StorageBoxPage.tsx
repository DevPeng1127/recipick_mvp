import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useIngredientStore } from '../stores/useIngredientStore'
import IngredientForm from '../components/ingredient/IngredientForm'
import IngredientList from '../components/ingredient/IngredientList'
import EditIngredientModal from '../components/ingredient/EditIngredientModal'
import ConsumeDisposeDialog from '../components/ingredient/ConsumeDisposeDialog'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorMessage from '../components/common/ErrorMessage'
import type { Ingredient, ConsumeDisposeRequest } from '../types/ingredient'

type ActionType = 'consume' | 'dispose'

export default function StorageBoxPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const storageBoxId = Number(id)

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

  useEffect(() => {
    fetchByStorageBox(storageBoxId)
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
