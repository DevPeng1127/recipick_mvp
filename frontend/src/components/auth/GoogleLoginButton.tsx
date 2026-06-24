import { getLoginUrl } from '../../api/auth'
import { useToastStore } from '../../stores/useToastStore'

export default function GoogleLoginButton() {
  const handleClick = async () => {
    try {
      const { login_url, state } = await getLoginUrl('google')
      sessionStorage.setItem('oauth_state', state)
      window.location.href = login_url
    } catch {
      useToastStore.getState().addToast('error', 'Google 로그인 URL을 가져오지 못했습니다.')
    }
  }

  return (
    <button
      onClick={handleClick}
      className="w-full py-3 px-4 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition"
    >
      Google로 시작하기
    </button>
  )
}
