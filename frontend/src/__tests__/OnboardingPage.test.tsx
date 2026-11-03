import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import * as users from '../api/users'
import * as fridges from '../api/refrigerators'
import OnboardingPage from '../pages/OnboardingPage'
import { useAuthStore } from '../stores/useAuthStore'
import { usePreferenceStore } from '../stores/usePreferenceStore'
import { saveInvitation } from '../utils/invitation'

vi.mock('../api/users')
vi.mock('../api/refrigerators')
const account = { id: 1, nickname: '테스트', oauth_provider: 'kakao' }
const preference = { id: 1, user_id: 1, cooking_skill: null, max_time: 30,
  allergies: [], cooking_tools: [], dietary_habits: '' }
const fridge = { id: 10, name: '우리집 냉장고', role: 'OWNER' as const, created_at: '',
  is_favorite: false, top_ingredients: [], total_ingredient_count: 0 }

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  useAuthStore.setState({ user: account, isAuthenticated: true, isLoading: false })
  usePreferenceStore.setState({ preference: null, error: null, isLoading: false })
  vi.mocked(users.updateMe).mockResolvedValue(account)
  vi.mocked(users.updateMyPreference).mockResolvedValue(preference)
  vi.mocked(fridges.createRefrigerator).mockResolvedValue(fridge)
  vi.mocked(fridges.ensureInitialRefrigerator).mockResolvedValue(undefined)
})
afterEach(cleanup)

async function lastStep() {
  render(<MemoryRouter initialEntries={['/onboarding']}><Routes>
    <Route path="/onboarding" element={<OnboardingPage />} />
    <Route path="/dashboard" element={<h1>냉장고 목록</h1>} />
    <Route path="/invite" element={<h1>초대 확인</h1>} />
  </Routes></MemoryRouter>)
  for (let index = 0; index < 5; index++) await userEvent.click(screen.getByRole('button', { name: '다음' }))
}

it('submits only once when start is clicked repeatedly before the first response', async () => {
  let finish!: (value: users.UserResponse) => void
  vi.mocked(users.updateMe).mockReturnValue(new Promise(resolve => { finish = resolve }))
  await lastStep()
  const start = screen.getByRole('button', { name: '시작하기' })
  act(() => { fireEvent.click(start); fireEvent.click(start); fireEvent.click(start) })
  expect(users.updateMe).toHaveBeenCalledTimes(1)
  expect(start).toBeDisabled()
  expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()
  await act(async () => finish(account))
  expect(await screen.findByRole('heading', { name: '냉장고 목록' })).toBeVisible()
  expect(users.updateMyPreference).toHaveBeenCalledTimes(1)
  expect(fridges.ensureInitialRefrigerator).toHaveBeenCalledTimes(1)
  expect(fridges.createRefrigerator).not.toHaveBeenCalled()
})

it.each(['preference', 'refrigerator'])('keeps controls locked while saving %s', async stage => {
  let finish!: () => void
  const waiting = new Promise<void>(resolve => { finish = resolve })
  if (stage === 'preference') vi.mocked(users.updateMyPreference).mockImplementation(async () => { await waiting; return preference })
  else vi.mocked(fridges.ensureInitialRefrigerator).mockReturnValue(waiting)
  await lastStep()
  await userEvent.dblClick(screen.getByRole('button', { name: '시작하기' }))
  const pending = screen.getByRole('button', { name: '시작하는 중…' })
  expect(pending).toBeDisabled()
  expect(screen.getByRole('textbox')).toBeDisabled()
  expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()
  fireEvent.click(pending)
  expect(users.updateMe).toHaveBeenCalledTimes(1)
  await act(async () => finish())
  expect(await screen.findByRole('heading', { name: '냉장고 목록' })).toBeVisible()
  expect(fridges.ensureInitialRefrigerator).toHaveBeenCalledTimes(1)
})

it.each(['nickname', 'preference', 'refrigerator'])('stops after a failed %s request and permits a manual retry with the draft intact', async stage => {
  if (stage === 'nickname') vi.mocked(users.updateMe).mockRejectedValueOnce(new Error('offline'))
  if (stage === 'preference') vi.mocked(users.updateMyPreference).mockRejectedValueOnce(new Error('offline'))
  if (stage === 'refrigerator') vi.mocked(fridges.ensureInitialRefrigerator).mockRejectedValueOnce(new Error('response lost'))
  await lastStep()
  await userEvent.type(screen.getByRole('textbox'), '입력 보존 테스트')
  await userEvent.click(screen.getByRole('button', { name: '시작하기' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('다시 시도')
  expect(screen.getByRole('textbox')).toHaveValue('입력 보존 테스트')
  expect(screen.getByRole('button', { name: '시작하기' })).toBeEnabled()
  expect(screen.queryByRole('heading', { name: '냉장고 목록' })).toBeNull()
  expect(fridges.ensureInitialRefrigerator).toHaveBeenCalledTimes(stage === 'refrigerator' ? 1 : 0)
  if (stage === 'nickname') expect(users.updateMyPreference).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: '시작하기' }))
  expect(await screen.findByRole('heading', { name: '냉장고 목록' })).toBeVisible()
  expect(users.updateMyPreference).toHaveBeenLastCalledWith(expect.objectContaining({ dietary_habits: '입력 보존 테스트' }))
  expect(fridges.createRefrigerator).not.toHaveBeenCalled()
})

it('leaves an invitation for explicit acceptance and skips the initial fridge', async () => {
  saveInvitation('a'.repeat(43))
  await lastStep()
  await userEvent.click(screen.getByRole('button', { name: '시작하기' }))
  expect(await screen.findByRole('heading', { name: '초대 확인' })).toBeVisible()
  expect(fridges.ensureInitialRefrigerator).not.toHaveBeenCalled()
})

it('reports preference save failure to callers and clears the error after retry', async () => {
  vi.mocked(users.updateMyPreference).mockRejectedValueOnce(new Error('offline'))
  expect(await usePreferenceStore.getState().savePreference({ max_time: 30 })).toBe(false)
  expect(usePreferenceStore.getState()).toMatchObject({ isLoading: false, preference: null, error: '선호 설정 저장에 실패했습니다.' })
  expect(await usePreferenceStore.getState().savePreference({ max_time: 30 })).toBe(true)
  expect(usePreferenceStore.getState()).toMatchObject({ isLoading: false, preference, error: null })
})
