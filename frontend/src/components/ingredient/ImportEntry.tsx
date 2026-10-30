import { Link } from 'react-router-dom'

export default function ImportEntry({ refrigeratorId, storageBoxId }: { refrigeratorId?: number; storageBoxId?: number }) {
  const context = storageBoxId ? `&storageBox=${storageBoxId}` : refrigeratorId ? `&refrigerator=${refrigeratorId}` : ''
  return <div className="mb-5 flex flex-wrap gap-3" aria-label="식재료 자동 입력">
    {(['receipt', 'voice'] as const).map(mode => <Link key={mode} to={`/ingredients/import?mode=${mode}${context}`}
      className="rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-purple-700 hover:bg-purple-100">
      {mode === 'receipt' ? '영수증으로 등록' : '음성으로 등록'}
    </Link>)}
  </div>
}
