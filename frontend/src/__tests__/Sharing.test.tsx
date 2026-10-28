import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import InvitationPage from '../pages/InvitationPage'
import SharingPage from '../pages/SharingPage'
import OAuthCallbackPage from '../pages/OAuthCallbackPage'
import OnboardingPage from '../pages/OnboardingPage'
import * as sharing from '../api/sharing'
import * as fridges from '../api/refrigerators'
import { getMyPreference } from '../api/users'
import { useAuthStore } from '../stores/useAuthStore'
import { usePreferenceStore } from '../stores/usePreferenceStore'
import { useRefrigeratorStore } from '../stores/useRefrigeratorStore'
import { afterLoginPath, pendingInvitation, saveInvitation } from '../utils/invitation'

vi.mock('../api/sharing')
vi.mock('../api/refrigerators')
vi.mock('../api/users')
const token = 'a'.repeat(43)
const people = [{ id: 1, user_id: 1, nickname: '소유자', role: 'OWNER' as const }, { id: 2, user_id: 2, nickname: '가족', role: 'GUEST' as const }]
const detail = { id: 10, name: '함께 냉장고', role: 'OWNER' as const, created_at: '', is_favorite: false, top_ingredients: [], total_ingredient_count: 0, members: people, storage_boxes: [] }
const preview = { refrigerator_id: 10, refrigerator_name: '함께 냉장고', expires_at: '2099-01-01T00:00:00Z', already_member: false }

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  useAuthStore.setState({ user: { id: 1, nickname: '소유자', oauth_provider: 'kakao' }, isAuthenticated: true, isLoading: false })
  vi.mocked(sharing.previewInvitation).mockResolvedValue(preview)
  vi.mocked(fridges.getRefrigerator).mockResolvedValue(detail)
  vi.mocked(sharing.listMembers).mockResolvedValue(people)
  vi.mocked(sharing.listInvitations).mockResolvedValue([])
})
afterEach(cleanup)

function Location() { return <p data-testid="location">{useLocation().pathname}{useLocation().hash}</p> }
function mount(path = `/invite#${token}`) {
  render(<MemoryRouter initialEntries={[path]}><Location /><Routes>
    <Route path="/invite" element={<InvitationPage />} />
    <Route path="/refrigerators/:id/sharing" element={<SharingPage />} />
    <Route path="/oauth/:provider/callback" element={<OAuthCallbackPage />} />
    <Route path="/onboarding" element={<OnboardingPage />} />
    <Route path="*" element={<p>도착</p>} />
  </Routes></MemoryRouter>)
}

it('preserves invitation across login and removes the secret from the address without auto-joining', async () => {
  useAuthStore.setState({ user: null, isAuthenticated: false })
  mount()
  const login = await screen.findByRole('link', { name: '로그인하고 초대 확인' })
  expect(pendingInvitation()).toBe(token)
  expect(screen.getByTestId('location')).toHaveTextContent(/^\/invite$/)
  expect(sharing.previewInvitation).not.toHaveBeenCalled()
  expect(sharing.acceptInvitation).not.toHaveBeenCalled()
  await userEvent.click(login)
  expect(afterLoginPath()).toBe('/invite')
})

it('requires explicit acceptance and prevents double submissions', async () => {
  let finish!: (value: { refrigerator_id: number; already_member: boolean }) => void
  vi.mocked(sharing.acceptInvitation).mockReturnValue(new Promise(resolve => { finish = resolve }))
  mount()
  const button = await screen.findByRole('button', { name: '초대 수락하고 참여' })
  expect(sharing.acceptInvitation).not.toHaveBeenCalled()
  await userEvent.dblClick(button)
  expect(sharing.acceptInvitation).toHaveBeenCalledTimes(1)
  await act(async () => finish({ refrigerator_id: 10, already_member: false }))
  expect(screen.getByTestId('location')).toHaveTextContent('/refrigerators/10')
  expect(pendingInvitation()).toBeNull()
})

it('shows expired or revoked invite and does not attempt joining', async () => {
  vi.mocked(sharing.previewInvitation).mockRejectedValue({ isAxiosError: true, response: { status: 410 } })
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('새 링크')
  expect(screen.queryByRole('button', { name: '초대 수락하고 참여' })).toBeNull()
})

it('clears an old pending invite when a malformed link is opened', async () => {
  saveInvitation(token)
  mount('/invite#invalid')
  expect(await screen.findByRole('alert')).toHaveTextContent('초대 링크가 없습니다')
  expect(pendingInvitation()).toBeNull()
  expect(sharing.previewInvitation).not.toHaveBeenCalled()
})

it('returns to the invitation after a valid OAuth callback', async () => {
  saveInvitation(token)
  sessionStorage.setItem('oauth_state', 'expected')
  const login = vi.fn().mockResolvedValue(undefined)
  useAuthStore.setState({ login })
  vi.mocked(getMyPreference).mockResolvedValue({ id: 1, user_id: 1, cooking_skill: null, max_time: 30, allergies: [], cooking_tools: [], dietary_habits: '' })
  mount('/oauth/kakao/callback?code=test&state=expected')
  await screen.findByRole('button', { name: '초대 수락하고 참여' })
  expect(login).toHaveBeenCalledWith('kakao', 'test', 'expected')
  expect(sessionStorage.getItem('oauth_state')).toBeNull()
})

it('keeps OAuth state checking while an invite is pending', async () => {
  saveInvitation(token)
  const login = vi.fn()
  useAuthStore.setState({ login })
  sessionStorage.setItem('oauth_state', 'different')
  mount('/oauth/kakao/callback?code=test&state=wrong')
  expect(await screen.findByText('보안 검증에 실패했습니다. 다시 로그인해주세요.')).toBeVisible()
  expect(login).not.toHaveBeenCalled()
})

it('keeps the invite while a new account completes onboarding', async () => {
  saveInvitation(token)
  sessionStorage.setItem('oauth_state', 'expected')
  useAuthStore.setState({ login: vi.fn().mockResolvedValue(undefined) })
  vi.mocked(getMyPreference).mockResolvedValue(null)
  mount('/oauth/kakao/callback?code=test&state=expected')
  expect(await screen.findByText('닉네임을 설정해주세요')).toBeVisible()
  expect(pendingInvitation()).toBe(token)
  expect(sharing.acceptInvitation).not.toHaveBeenCalled()
})

it('onboarding returns invited users to explicit acceptance without creating another fridge', async () => {
  saveInvitation(token)
  const add = vi.fn()
  useAuthStore.setState({ updateNickname: vi.fn().mockResolvedValue(undefined) })
  usePreferenceStore.setState({ savePreference: vi.fn().mockResolvedValue(undefined) })
  useRefrigeratorStore.setState({ addRefrigerator: add })
  mount('/onboarding')
  for (let step = 0; step < 5; step++) await userEvent.click(screen.getByRole('button', { name: '다음' }))
  await userEvent.click(screen.getByRole('button', { name: '시작하기' }))
  expect(await screen.findByRole('button', { name: '초대 수락하고 참여' })).toBeVisible()
  expect(add).not.toHaveBeenCalled()
  expect(sharing.acceptInvitation).not.toHaveBeenCalled()
})

it('owner creates a link and revokes it explicitly', async () => {
  vi.mocked(sharing.createInvitation).mockResolvedValue({ id: 5, url: `http://localhost/invite#${token}`, status: 'active', created_at: '', expires_at: '2099-01-01T00:00:00Z' })
  mount('/refrigerators/10/sharing')
  await userEvent.click(await screen.findByRole('button', { name: '초대 링크 만들기' }))
  expect(await screen.findByLabelText('새 초대 링크')).toHaveValue(`http://localhost/invite#${token}`)
  await userEvent.click(screen.getByRole('button', { name: '초대 취소' }))
  await waitFor(() => expect(sharing.revokeInvitation).toHaveBeenCalledWith(10, 5))
  expect(screen.queryByLabelText('새 초대 링크')).toBeNull()
})

it('guest cannot see invite/member management and confirms before leaving', async () => {
  useAuthStore.setState({ user: { id: 2, nickname: '가족', oauth_provider: 'kakao' } })
  vi.mocked(fridges.getRefrigerator).mockResolvedValue({ ...detail, role: 'GUEST' })
  mount('/refrigerators/10/sharing')
  await userEvent.click(await screen.findByRole('button', { name: '이 냉장고에서 탈퇴' }))
  expect(sharing.listInvitations).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: '초대 링크 만들기' })).toBeNull()
  expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull()
  expect(sharing.removeMember).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '확인' }))
  expect(sharing.removeMember).toHaveBeenCalledWith(10, 'me')
  expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
})

it('failed member removal retains the member and displays an error', async () => {
  vi.mocked(sharing.removeMember).mockRejectedValue(new Error('network'))
  mount('/refrigerators/10/sharing')
  await userEvent.click(await screen.findByRole('button', { name: '내보내기' }))
  await userEvent.click(screen.getByRole('button', { name: '확인' }))
  expect(await screen.findByText('작업 결과를 확인하지 못했습니다. 새로고침하여 상태를 확인해 주세요.')).toBeVisible()
  expect(screen.getByText('함께 사용하는 회원 (2명)')).toBeVisible()
})
