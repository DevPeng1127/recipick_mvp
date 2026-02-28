import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/useAuthStore'

import AuthGuard from './components/layout/AuthGuard'
import AppLayout from './components/layout/AppLayout'

import LoginPage from './pages/LoginPage'
import OAuthCallbackPage from './pages/OAuthCallbackPage'
import OnboardingPage from './pages/OnboardingPage'
import DashboardPage from './pages/DashboardPage'
import RefrigeratorPage from './pages/RefrigeratorPage'
import StorageBoxPage from './pages/StorageBoxPage'
import RecipePage from './pages/RecipePage'
import PreferencePage from './pages/PreferencePage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  const { initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/oauth/:provider/callback" element={<OAuthCallbackPage />} />

      {/* Protected routes */}
      <Route path="/onboarding" element={
        <AuthGuard><OnboardingPage /></AuthGuard>
      } />

      <Route element={<AuthGuard><AppLayout /></AuthGuard>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/refrigerators/:id" element={<RefrigeratorPage />} />
        <Route path="/storage-boxes/:id" element={<StorageBoxPage />} />
        <Route path="/recipes" element={<RecipePage />} />
        <Route path="/preferences" element={<PreferencePage />} />
      </Route>

      {/* Redirects and fallback */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
