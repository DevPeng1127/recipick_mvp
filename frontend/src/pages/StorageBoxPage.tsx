import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useIngredientStore } from '../stores/useIngredientStore'
import IngredientForm from '../components/ingredient/IngredientForm'
import IngredientList from '../components/ingredient/IngredientList'
import EditIngredientModal from '../components/ingredient/EditIngredientModal'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorMessage from '../components/common/ErrorMessage'
import type { Ingredient } from '../types/ingredient'

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
    removeIngredient,
  } = useIngredientStore()

  const [editTarget, setEditTarget] = useState<Ingredient | null>(null)

  useEffect(() => {
    fetchByStorageBox(storageBoxId)
  }, [storageBoxId, fetchByStorageBox])

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />

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

      <div className="mb-4">
        <IngredientForm
          onSubmit={async (data) => {
            await addIngredient(storageBoxId, data)
          }}
        />
      </div>

      <IngredientList
        ingredients={ingredients}
        onDelete={(ingredientId) => removeIngredient(storageBoxId, ingredientId)}
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
    </div>
  )
}
