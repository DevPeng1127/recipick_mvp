import { getLoginUrl } from '../../api/auth'

export default function GoogleLoginButton() {
  const handleClick = async () => {
    try {
      const { login_url } = await getLoginUrl('google')
      window.location.href = login_url
    } catch {
      alert('Google 로그인 URL을 가져오지 못했습니다.')
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
