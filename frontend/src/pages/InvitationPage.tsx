import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { acceptInvitation, previewInvitation, type InvitationPreview } from '../api/sharing'
import { useAuthStore } from '../stores/useAuthStore'
import { clearInvitation, pendingInvitation, saveInvitation } from '../utils/invitation'

export default function InvitationPage() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, isLoading, user } = useAuthStore()
  const [token, setToken] = useState(pendingInvitation)
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    if (!hash) return
    const incoming = hash.slice(1)
    setToken(saveInvitation(incoming) ? incoming : null)
    setPreview(null)
    setError('')
    navigate('/invite', { replace: true })
  }, [hash, navigate])

  useEffect(() => {
    if (hash || !token || !isAuthenticated || isLoading || !user) return
    let active = true
    setPreview(null)
    setError('')
    previewInvitation(token).then((result) => {
      if (active) setPreview(result)
    }).catch((err: unknown) => {
      if (active) setError(axios.isAxiosError(err) && err.response?.status === 410
        ? '사용할 수 없는 초대입니다. 소유자에게 새 링크를 요청해 주세요.'
        : '초대를 확인하지 못했습니다. 새로고침하여 다시 시도해 주세요.')
    })
    return () => { active = false }
  }, [hash, token, isAuthenticated, isLoading, user])

  const accept = async () => {
    if (!token || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const result = await acceptInvitation(token)
      clearInvitation()
      navigate(`/refrigerators/${result.refrigerator_id}`, { replace: true })
    } catch (err) {
      setError(axios.isAxiosError(err) && [404, 410].includes(err.response?.status ?? 0)
        ? '초대가 만료되었거나 취소·사용되었습니다. 새 링크를 요청해 주세요.'
        : '참여를 확인하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <section className="bg-white rounded-2xl border p-6 w-full max-w-md space-y-5">
      <p className="text-purple-600 font-semibold">Recipick</p>
      <h1 className="text-2xl font-bold">냉장고 초대</h1>
      {!token && !hash ? <p role="alert">초대 링크가 없습니다. 소유자에게 새 링크를 요청해 주세요.</p>
        : isLoading ? <p>계정을 확인하고 있습니다…</p>
        : !isAuthenticated ? <>
          <p>로그인 후 냉장고를 확인하고 참여할 수 있습니다.</p>
          <Link className="block text-center bg-purple-600 text-white rounded-lg p-3" to="/login">로그인하고 초대 확인</Link>
        </> : preview ? <>
          <h2 className="text-xl font-semibold break-words">{preview.refrigerator_name}</h2>
          <p className="text-gray-600">보관함과 식재료를 함께 사용합니다. 가족이 재료를 수정하거나 소비·폐기하면 모두에게 반영됩니다.</p>
          <p className="text-sm text-gray-500">초대 유효 기한: {new Date(preview.expires_at).toLocaleString('ko-KR')}</p>
          {preview.already_member ? <>
            <p>이미 참여한 냉장고입니다.</p>
            <button className="w-full p-3 bg-purple-600 text-white rounded-lg" onClick={() => {
              clearInvitation()
              navigate(`/refrigerators/${preview.refrigerator_id}`, { replace: true })
            }}>냉장고 열기</button>
          </> : <button disabled={busy} onClick={accept} className="w-full p-3 bg-purple-600 text-white rounded-lg disabled:opacity-50">
            {busy ? '참여 중…' : '초대 수락하고 참여'}
          </button>}
        </> : !error ? <p>초대를 확인하고 있습니다…</p> : null}
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <button disabled={busy} className="text-gray-600 underline" onClick={() => {
        clearInvitation()
        navigate(isAuthenticated ? '/dashboard' : '/login', { replace: true })
      }}>닫기</button>
    </section>
  </main>
}
