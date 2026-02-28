interface ExpiryBadgeProps {
  expiryDate: string | null
}

export default function ExpiryBadge({ expiryDate }: ExpiryBadgeProps) {
  if (!expiryDate) {
    return <span className="text-xs text-gray-400">기한 없음</span>
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate)
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let colorClass = 'bg-gray-100 text-gray-600'
  let label = `D-${diffDays}`

  if (diffDays < 0) {
    colorClass = 'bg-red-100 text-red-700'
    label = `D+${Math.abs(diffDays)} 지남`
  } else if (diffDays === 0) {
    colorClass = 'bg-red-100 text-red-700'
    label = '오늘 만료'
  } else if (diffDays <= 3) {
    colorClass = 'bg-orange-100 text-orange-700'
    label = `D-${diffDays}`
  } else if (diffDays <= 7) {
    colorClass = 'bg-yellow-100 text-yellow-700'
    label = `D-${diffDays}`
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colorClass}`}>
      {label}
    </span>
  )
}
