import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/useAuthStore'

export default function Header() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
        <Link to="/dashboard" className="text-xl font-bold text-purple-600">
          Recipick
        </Link>
        <nav className="flex items-center gap-4">
          <Link to="/dashboard" className="text-gray-600 hover:text-purple-600">
            냉장고
          </Link>
          <Link to="/recipes" className="text-gray-600 hover:text-purple-600">
            레시피
          </Link>
          <Link to="/preferences" className="text-gray-600 hover:text-purple-600">
            설정
          </Link>
          {user && (
            <span className="text-sm text-gray-500">{user.nickname}</span>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 hover:text-red-500"
          >
            로그아웃
          </button>
        </nav>
      </div>
    </header>
  )
}
