import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <p className="text-gray-500 mb-6">페이지를 찾을 수 없습니다</p>
        <Link
          to="/dashboard"
          className="text-purple-600 hover:underline"
        >
          대시보드로 돌아가기
        </Link>
      </div>
    </div>
  )
}
