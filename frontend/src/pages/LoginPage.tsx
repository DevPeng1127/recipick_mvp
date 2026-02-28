import { Navigate } from 'react-router-dom'
import KakaoLoginButton from '../components/auth/KakaoLoginButton'
import GoogleLoginButton from '../components/auth/GoogleLoginButton'
import { useAuthStore } from '../stores/useAuthStore'

export default function LoginPage() {
  const { isAuthenticated } = useAuthStore()

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-purple-600 mb-2">Recipick</h1>
          <p className="text-gray-500">냉장고 식재료로 AI 레시피 추천</p>
        </div>
        <div className="space-y-3">
          <KakaoLoginButton />
          <GoogleLoginButton />
        </div>
      </div>
    </div>
  )
}
