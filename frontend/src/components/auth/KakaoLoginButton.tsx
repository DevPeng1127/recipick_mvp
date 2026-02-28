import { getLoginUrl } from '../../api/auth'

export default function KakaoLoginButton() {
  const handleClick = async () => {
    try {
      const { login_url } = await getLoginUrl('kakao')
      window.location.href = login_url
    } catch {
      alert('카카오 로그인 URL을 가져오지 못했습니다.')
    }
  }

  return (
    <button
      onClick={handleClick}
      className="w-full py-3 px-4 bg-yellow-300 text-gray-900 rounded-lg font-medium hover:bg-yellow-400 transition"
    >
      카카오로 시작하기
    </button>
  )
}
