import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import { getMyPreference } from '../api/users'
import LoadingSpinner from '../components/common/LoadingSpinner'

export default function OAuthCallbackPage() {
  const { provider } = useParams<{ provider: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const [error, setError] = useState<string | null>(null)
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const code = searchParams.get('code')
    if (!provider || !code) {
      setError('잘못된 콜백 요청입니다.')
      return
    }

    login(provider, code)
      .then(async () => {
        const pref = await getMyPreference()
        if (pref === null) {
          navigate('/onboarding', { replace: true })
        } else {
          navigate('/dashboard', { replace: true })
        }
      })
      .catch(() => setError('로그인에 실패했습니다.'))
  }, [provider, searchParams, login, navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="text-purple-600 hover:underline"
          >
            로그인 페이지로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <LoadingSpinner />
        <p className="text-gray-500 mt-4">로그인 처리 중...</p>
      </div>
    </div>
  )
}
