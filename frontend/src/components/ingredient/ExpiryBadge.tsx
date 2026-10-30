import type { ExpirySource } from '../../types/ingredient'
import { todayKst, expiryText } from '../../constants/expiry'

interface ExpiryBadgeProps {
  expiryDate: string | null
  expirySource?: ExpirySource
}

export default function ExpiryBadge({ expiryDate, expirySource }: ExpiryBadgeProps) {
  if (!expiryDate) {
    return <span className="text-xs text-gray-400">{expiryText(null, expirySource)}</span>
  }

  const diffDays = Math.round((Date.parse(`${expiryDate}T00:00:00Z`) - Date.parse(`${todayKst()}T00:00:00Z`)) / 86400000)

  let colorClass = 'bg-gray-100 text-gray-600'
  let label = `D-${diffDays}`

  if (diffDays < 0) {
    colorClass = 'bg-red-100 text-red-700'
    label = `D+${Math.abs(diffDays)} 지남`
  } else if (diffDays === 0) {
    colorClass = 'bg-red-100 text-red-700'
    label = '오늘'
  } else if (diffDays <= 3) {
    colorClass = 'bg-orange-100 text-orange-700'
    label = `D-${diffDays}`
  } else if (diffDays <= 7) {
    colorClass = 'bg-yellow-100 text-yellow-700'
    label = `D-${diffDays}`
  }

  return (
    <span title={expiryText(expiryDate, expirySource)} className={`text-xs px-2 py-0.5 rounded-full ${colorClass}`}>
      {expirySource === 'estimated' ? '권장 ' : expirySource === 'label' ? '소비기한 ' : '기한 '}{label}
    </span>
  )
}
