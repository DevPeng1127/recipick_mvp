import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useIngredientStore } from '../stores/useIngredientStore'
import IngredientForm from '../components/ingredient/IngredientForm'
import IngredientList from '../components/ingredient/IngredientList'
import EditIngredientModal from '../components/ingredient/EditIngredientModal'
import ConsumeDisposeDialog from '../components/ingredient/ConsumeDisposeDialog'
import BulkIngredientDialog from '../components/ingredient/BulkIngredientDialog'
import ImportEntry from '../components/ingredient/ImportEntry'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorMessage from '../components/common/ErrorMessage'
import type { Ingredient, ConsumeDisposeRequest, BulkIngredientAction } from '../types/ingredient'

type ActionType = 'consume' | 'dispose'
const BULK_LIMIT = 100

export default function StorageBoxPage() {
  const { id } = useParams<{ id: string }>()
  return <StorageBoxContent key={id} storageBoxId={Number(id)} />
}

function StorageBoxContent({ storageBoxId }: { storageBoxId: number }) {
  const navigate = useNavigate()

  const {
    ingredients: storedIngredients,
    isLoading,
    error,
    fetchByStorageBox,
    addIngredient,
    editIngredient,
    removeIngredient,
    consumeIngredient,
    disposeIngredient,
    bulkAction,
  } = useIngredientStore()
  const ingredients = storedIngredients.filter(item => item.storage_box_id === storageBoxId)

  const [editTarget, setEditTarget] = useState<Ingredient | null>(null)
  const [consumeDisposeTarget, setConsumeDisposeTarget] = useState<Ingredient | null>(null)
  const [actionType, setActionType] = useState<ActionType>('consume')
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [bulkTarget, setBulkTarget] = useState<{ action: BulkIngredientAction; ingredients: Ingredient[] } | null>(null)
  const selectedIngredients = ingredients.filter(item => selectedIds.has(item.id))
  const allSelected = ingredients.length > 0 && selectedIngredients.length === ingredients.length

  const finishSelection = () => {
    setBulkTarget(null)
    setSelecting(false)
    setSelectedIds(new Set())
  }
  const refresh = () => {
    finishSelection()
    void fetchByStorageBox(storageBoxId)
  }

  useEffect(() => {
    setEditTarget(null)
    setConsumeDisposeTarget(null)
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

      {error && <><ErrorMessage message={error} /><button onClick={refresh} className="mt-2 text-sm underline">다시 불러오기</button></>}

      {!error && (
        <>
          {!selecting && <><ImportEntry storageBoxId={storageBoxId} />
          <div className="mb-4">
            <IngredientForm
              onSubmit={async (data) => {
                await addIngredient(storageBoxId, data)
              }}
            />
          </div></>}

          <fieldset disabled={!!bulkTarget} className="mb-3 rounded-lg border bg-white p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-600" role="status">{selecting ? `${selectedIngredients.length}개 선택됨` : `식재료 ${ingredients.length}개`}</p>
              <button type="button" disabled={!ingredients.length} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
                onClick={() => { if (selecting) finishSelection(); else setSelecting(true) }}>{selecting ? '선택 취소' : '선택'}</button>
            </div>
            {selecting && <>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={allSelected} disabled={ingredients.length > BULK_LIMIT} className="h-4 w-4 accent-purple-600"
                  onChange={() => setSelectedIds(allSelected ? new Set() : new Set(ingredients.map(item => item.id)))} />
                전체 선택
              </label>
              {ingredients.length > BULK_LIMIT && <p className="text-sm text-gray-500">한 번에 최대 {BULK_LIMIT}개까지 선택할 수 있습니다.</p>}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={!selectedIngredients.length} onClick={() => setBulkTarget({ action: 'delete', ingredients: selectedIngredients.map(item => ({ ...item })) })}
                  className="rounded-lg border border-gray-300 py-2 text-sm text-gray-700 disabled:opacity-40">선택한 {selectedIngredients.length}개 삭제</button>
                <button type="button" disabled={!selectedIngredients.length} onClick={() => setBulkTarget({ action: 'dispose', ingredients: selectedIngredients.map(item => ({ ...item })) })}
                  className="rounded-lg bg-red-600 py-2 text-sm text-white disabled:opacity-40">선택한 {selectedIngredients.length}개 폐기</button>
              </div>
            </>}
          </fieldset>

          <IngredientList
            ingredients={ingredients}
            onConsume={handleConsume}
            onDispose={handleDispose}
            onEdit={(ingredient) => setEditTarget(ingredient)}
            selection={selecting ? {
              ids: new Set(selectedIngredients.map(item => item.id)), disabled: !!bulkTarget, limit: BULK_LIMIT,
              onToggle: itemId => setSelectedIds(current => {
                const next = new Set(current)
                if (next.has(itemId)) next.delete(itemId)
                else if (next.size < BULK_LIMIT) next.add(itemId)
                return next
              }),
            } : undefined}
          />

          {bulkTarget && <BulkIngredientDialog
            action={bulkTarget.action} ingredients={bulkTarget.ingredients}
            onConfirm={data => bulkAction(storageBoxId, data)}
            onClose={() => setBulkTarget(null)} onRefresh={refresh} onComplete={finishSelection}
          />}

          <EditIngredientModal
            key={`${storageBoxId}-${editTarget?.id ?? 'closed'}`}
            isOpen={!!editTarget}
            onClose={() => setEditTarget(null)}
            ingredient={editTarget}
            onDelete={async () => {
              if (editTarget) await removeIngredient(storageBoxId, editTarget.id)
            }}
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
