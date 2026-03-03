import { useEffect, useState } from 'react'
import { useRefrigeratorStore } from '../stores/useRefrigeratorStore'
import RefrigeratorCard from '../components/refrigerator/RefrigeratorCard'
import CreateRefrigeratorModal from '../components/refrigerator/CreateRefrigeratorModal'
import EditRefrigeratorModal from '../components/refrigerator/EditRefrigeratorModal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorMessage from '../components/common/ErrorMessage'
import EmptyState from '../components/common/EmptyState'
import type { Refrigerator } from '../types/refrigerator'

export default function DashboardPage() {
  const {
    refrigerators,
    isLoading,
    error,
    fetchRefrigerators,
    addRefrigerator,
    editRefrigerator,
    removeRefrigerator,
  } = useRefrigeratorStore()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Refrigerator | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Refrigerator | null>(null)

  useEffect(() => {
    fetchRefrigerators()
  }, [fetchRefrigerators])

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">내 냉장고</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
        >
          냉장고 추가
        </button>
      </div>

      {refrigerators.length === 0 ? (
        <EmptyState
          icon="🧊"
          title="등록된 냉장고가 없습니다"
          description="냉장고를 추가하고 식재료를 관리해보세요"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {refrigerators.map((fridge) => (
            <RefrigeratorCard
              key={fridge.id}
              refrigerator={fridge}
              onEdit={() => setEditTarget(fridge)}
              onDelete={() => setDeleteTarget(fridge)}
            />
          ))}
        </div>
      )}

      <CreateRefrigeratorModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={async (name) => {
          await addRefrigerator(name)
        }}
      />

      <EditRefrigeratorModal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        currentName={editTarget?.name ?? ''}
        onSave={async (name) => {
          if (editTarget) await editRefrigerator(editTarget.id, name)
        }}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await removeRefrigerator(deleteTarget.id)
        }}
        title="냉장고 삭제"
        message="이 냉장고와 모든 보관함, 식재료가 삭제됩니다. 계속하시겠습니까?"
        confirmText="삭제"
      />
    </div>
  )
}
