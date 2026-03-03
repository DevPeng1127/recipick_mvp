import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRefrigeratorStore } from '../stores/useRefrigeratorStore'
import { useStorageBoxStore } from '../stores/useStorageBoxStore'
import StorageBoxCard from '../components/storage/StorageBoxCard'
import CreateStorageBoxModal from '../components/storage/CreateStorageBoxModal'
import EditStorageBoxModal from '../components/storage/EditStorageBoxModal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorMessage from '../components/common/ErrorMessage'
import EmptyState from '../components/common/EmptyState'
import type { StorageBox, StorageType } from '../types/storage'

export default function RefrigeratorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const refrigeratorId = Number(id)

  const {
    currentRefrigerator,
    isLoading: fridgeLoading,
    error: fridgeError,
    fetchRefrigeratorDetail,
    removeRefrigerator,
  } = useRefrigeratorStore()

  const {
    storageBoxes,
    isLoading: boxLoading,
    fetchStorageBoxes,
    addStorageBox,
    editStorageBox,
    removeStorageBox,
  } = useStorageBoxStore()

  const [showCreateBox, setShowCreateBox] = useState(false)
  const [showDeleteFridge, setShowDeleteFridge] = useState(false)
  const [editBoxTarget, setEditBoxTarget] = useState<StorageBox | null>(null)
  const [deleteBoxTarget, setDeleteBoxTarget] = useState<StorageBox | null>(null)

  useEffect(() => {
    fetchRefrigeratorDetail(refrigeratorId)
    fetchStorageBoxes(refrigeratorId)
  }, [refrigeratorId, fetchRefrigeratorDetail, fetchStorageBoxes])

  if (fridgeLoading || boxLoading) return <LoadingSpinner />
  if (fridgeError) return <ErrorMessage message={fridgeError} />

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-gray-400 hover:text-gray-600 mb-1"
          >
            &larr; 냉장고 목록
          </button>
          <h1 className="text-2xl font-bold text-gray-800">
            {currentRefrigerator?.name}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateBox(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            보관함 추가
          </button>
          <button
            onClick={() => setShowDeleteFridge(true)}
            className="px-4 py-2 border border-red-300 text-red-500 rounded-lg hover:bg-red-50"
          >
            삭제
          </button>
        </div>
      </div>

      {storageBoxes.length === 0 ? (
        <EmptyState
          icon="📦"
          title="보관함이 없습니다"
          description="보관함을 추가하고 식재료를 넣어보세요"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {storageBoxes.map((box) => (
            <StorageBoxCard
              key={box.id}
              storageBox={box}
              onEdit={() => setEditBoxTarget(box)}
              onDelete={() => setDeleteBoxTarget(box)}
            />
          ))}
        </div>
      )}

      <CreateStorageBoxModal
        isOpen={showCreateBox}
        onClose={() => setShowCreateBox(false)}
        onCreate={async (name: string, type: StorageType) => {
          await addStorageBox(refrigeratorId, { name, type })
        }}
      />

      <EditStorageBoxModal
        isOpen={!!editBoxTarget}
        onClose={() => setEditBoxTarget(null)}
        storageBox={editBoxTarget}
        onSave={async (data) => {
          if (editBoxTarget) {
            await editStorageBox(refrigeratorId, editBoxTarget.id, data)
          }
        }}
      />

      <ConfirmDialog
        isOpen={!!deleteBoxTarget}
        onClose={() => setDeleteBoxTarget(null)}
        onConfirm={async () => {
          if (deleteBoxTarget) {
            await removeStorageBox(refrigeratorId, deleteBoxTarget.id)
          }
        }}
        title="보관함 삭제"
        message="이 보관함과 모든 식재료가 삭제됩니다. 계속하시겠습니까?"
        confirmText="삭제"
      />

      <ConfirmDialog
        isOpen={showDeleteFridge}
        onClose={() => setShowDeleteFridge(false)}
        onConfirm={async () => {
          await removeRefrigerator(refrigeratorId)
          navigate('/dashboard')
        }}
        title="냉장고 삭제"
        message="이 냉장고와 모든 보관함, 식재료가 삭제됩니다. 계속하시겠습니까?"
        confirmText="삭제"
      />
    </div>
  )
}
