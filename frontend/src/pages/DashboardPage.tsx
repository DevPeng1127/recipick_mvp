import { useEffect, useState, useCallback, useRef } from 'react'
import { useRefrigeratorStore } from '../stores/useRefrigeratorStore'
import { searchIngredients, type IngredientSearchResult } from '../api/ingredients'
import RefrigeratorCard from '../components/refrigerator/RefrigeratorCard'
import SortableContainer from '../components/common/SortableContainer'
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
    toggleFavorite,
    reorderRefrigerators,
  } = useRefrigeratorStore()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Refrigerator | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Refrigerator | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<IngredientSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchRefrigerators()
  }, [fetchRefrigerators])

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([])
      setHasSearched(false)
      setIsSearching(false)
      return
    }
    setIsSearching(true)
    try {
      const results = await searchIngredients(query.trim())
      setSearchResults(results)
      setHasSearched(true)
    } catch {
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const onSearchChange = (value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => handleSearch(value), 300)
  }

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />

  return (
    <div>
      {/* Search section */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-800 mb-3">어디다 뒀더라?</h2>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="식재료 검색..."
            className="w-full px-4 py-2.5 pl-10 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        </div>

        {searchQuery.trim() && (
          <div className="mt-2 bg-white border border-gray-200 rounded-xl overflow-hidden">
            {isSearching ? (
              <p className="px-4 py-3 text-sm text-gray-400">검색 중...</p>
            ) : hasSearched && searchResults.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">찾는 식재료가 없습니다</p>
            ) : (
              searchResults.map((item) => (
                <div
                  key={`${item.refrigerator_id}-${item.ingredient_id}`}
                  className="px-4 py-3 border-b last:border-b-0 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span className="text-gray-400">{item.refrigerator_name}</span>
                  <span className="text-gray-300 mx-1">&gt;</span>
                  <span className="text-gray-400">{item.storage_box_name}</span>
                  <span className="text-gray-300 mx-1">&gt;</span>
                  <span className="font-medium text-gray-800">{item.ingredient_name}</span>
                  <span className="text-gray-400 ml-1">({item.quantity}{item.unit})</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Refrigerators section */}
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
        <SortableContainer
          items={refrigerators}
          onReorder={reorderRefrigerators}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          renderItem={(fridge) => (
            <RefrigeratorCard
              refrigerator={fridge}
              onEdit={() => setEditTarget(fridge)}
              onDelete={() => setDeleteTarget(fridge)}
              onToggleFavorite={() => toggleFavorite(fridge.id)}
            />
          )}
        />
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
