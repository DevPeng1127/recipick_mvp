import { Link } from 'react-router-dom'
import type { Refrigerator } from '../../types/refrigerator'

interface RefrigeratorCardProps {
  refrigerator: Refrigerator
}

export default function RefrigeratorCard({ refrigerator }: RefrigeratorCardProps) {
  return (
    <Link
      to={`/refrigerators/${refrigerator.id}`}
      className="block bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition"
    >
      <h3 className="font-bold text-lg text-gray-800">{refrigerator.name}</h3>
      <p className="text-sm text-gray-400 mt-1">
        {new Date(refrigerator.created_at).toLocaleDateString('ko-KR')}
      </p>
    </Link>
  )
}
