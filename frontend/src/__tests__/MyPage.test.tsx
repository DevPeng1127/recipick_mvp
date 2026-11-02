import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../api/activity'
import MyPage from '../pages/MyPage'
import Header from '../components/layout/Header'
import { useAuthStore } from '../stores/useAuthStore'
import type { ActivityDashboard } from '../types/activity'

vi.mock('../api/activity')

function response(patch: Partial<ActivityDashboard> = {}): ActivityDashboard {
  return { scope: 'mine', refrigerator_name: null,
    refrigerators: [{ id: 10, name: '가족 냉장고' }], start_date: '2026-09-30', end_date: '2026-10-29',
    as_of: '2026-10-28T15:30:00Z', counts: { consumed: 1, disposed: 1, total: 2 },
    daily: [{ date: '2026-10-28', consumed: 1, disposed: 0 }, { date: '2026-10-29', consumed: 0, disposed: 1 }],
    frequent_disposals: [{ name: '상추', count: 1 }], next_cursor: null,
    items: [
      { id: 2, action_type: 'DISPOSED', ingredient_name: '상추', quantity: 100, unit: 'g', refrigerator_id: 10,
        refrigerator_name: '가족 냉장고', actor_name: '나나', is_mine: true, expiry_date: '2026-10-28', memo: '확인 메모', created_at: '2026-10-28T15:00:00Z' },
      { id: 1, action_type: 'CONSUMED', ingredient_name: '달걀', quantity: 2, unit: '개', refrigerator_id: null,
        refrigerator_name: '옛 냉장고', actor_name: '나나', is_mine: true, expiry_date: null, memo: null, created_at: '2026-10-28T14:59:00Z' },
    ], ...patch }
}
const denied = (status: number) => ({ isAxiosError: true, response: { status } })
beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ user: { id: 1, nickname: '나나', oauth_provider: 'kakao' }, isAuthenticated: true, isLoading: false })
  vi.mocked(api.getActivity).mockResolvedValue(response())
})
afterEach(cleanup)
function mount() { return render(<MemoryRouter><MyPage /></MemoryRouter>) }
async function ready() { await screen.findByRole('heading', { name: '내 기록 요약' }) }

it('links to the protected my page from navigation', () => {
  render(<MemoryRouter><Header /></MemoryRouter>)
  expect(screen.getByRole('link', { name: '마이페이지' })).toHaveAttribute('href', '/my')
})

it('defaults to 30 days and personal records, showing counts and original units', async () => {
  mount(); await ready()
  expect(api.getActivity).toHaveBeenCalledWith({ days: 30, refrigeratorId: null, actionType: '' }, null, expect.any(AbortSignal))
  expect(screen.getByLabelText('조회 기간')).toHaveValue('30')
  expect(screen.getByLabelText('조회 범위')).toHaveValue('')
  expect(screen.getByLabelText('전체 처리 2건')).toBeVisible()
  const list = screen.getByRole('region', { name: '상세 이력' })
  expect(within(list).getByText('100 g')).toBeVisible()
  expect(within(list).getByText('2 개')).toBeVisible()
  expect(within(list).getByText(/옛 냉장고 \(삭제된 냉장고\)/)).toBeVisible()
  expect(within(list).getByText(/2026. 10. 29. 오전 12:00/)).toBeVisible()
  expect(screen.getByText(/재료별 처리 기록 1개를 1건/)).not.toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: '소비·폐기 기록 도움말' }))
  expect(screen.getByText(/재료별 처리 기록 1개를 1건/)).toBeVisible()
  expect(api.getActivity).toHaveBeenCalledTimes(1)
})

it('shows exact daily values and history memos through accessible details', async () => {
  mount(); await ready()
  await userEvent.click(screen.getByText('일별 수치 보기'))
  expect(screen.getByRole('table', { name: '일별 처리 건수 (한국 시간)' })).toBeVisible()
  await userEvent.click(screen.getByText('메모 보기'))
  expect(screen.getByText('확인 메모')).toBeVisible()
})

it('changes period, family scope, and action filters without merging data', async () => {
  mount(); await ready()
  const user = userEvent.setup()
  await user.selectOptions(screen.getByLabelText('조회 기간'), '7')
  await waitFor(() => expect(api.getActivity).toHaveBeenLastCalledWith({ days: 7, refrigeratorId: null, actionType: '' }, null, expect.any(AbortSignal)))
  vi.mocked(api.getActivity).mockResolvedValue(response({ scope: 'refrigerator', refrigerator_name: '가족 냉장고' }))
  await user.selectOptions(screen.getByLabelText('조회 범위'), '10')
  expect(await screen.findByRole('heading', { name: '가족 냉장고 · 가족 기록 요약' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '소비·폐기 기록 도움말' }))
  expect(screen.getByText(/가입 전 기록과 메모도 포함/)).toBeVisible()
  await user.selectOptions(screen.getByLabelText('처리 유형'), 'DISPOSED')
  await waitFor(() => expect(api.getActivity).toHaveBeenLastCalledWith({ days: 7, refrigeratorId: 10, actionType: 'DISPOSED' }, null, expect.any(AbortSignal)))
})

it('paginates without appending duplicate rows and resets pagination on filter changes', async () => {
  vi.mocked(api.getActivity).mockResolvedValueOnce(response({ next_cursor: 'page-2' }))
  mount(); await ready()
  vi.mocked(api.getActivity).mockResolvedValue(response({ items: [{ ...response().items[0], id: 3, ingredient_name: '다음 재료' }] }))
  await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
  expect(await screen.findByRole('heading', { name: '다음 재료' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: '달걀' })).toBeNull()
  expect(api.getActivity).toHaveBeenLastCalledWith(expect.anything(), 'page-2', expect.any(AbortSignal))
  await userEvent.selectOptions(screen.getByLabelText('조회 기간'), '90')
  await waitFor(() => expect(api.getActivity).toHaveBeenLastCalledWith({ days: 90, refrigeratorId: null, actionType: '' }, null, expect.any(AbortSignal)))
})

it('clears old results immediately and ignores late responses from earlier filters', async () => {
  mount(); await ready()
  let resolveOld!: (data: ActivityDashboard) => void
  vi.mocked(api.getActivity).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
  await userEvent.selectOptions(screen.getByLabelText('조회 기간'), '7')
  expect(screen.queryByRole('heading', { name: '상세 이력' })).toBeNull()
  vi.mocked(api.getActivity).mockResolvedValue(response({ items: [], counts: { total: 0, consumed: 0, disposed: 0 } }))
  await userEvent.selectOptions(screen.getByLabelText('조회 기간'), '90')
  await screen.findByText('이 조건에 해당하는 기록이 없습니다.')
  await act(async () => resolveOld(response()))
  expect(screen.getByLabelText('전체 처리 0건')).toBeVisible()
  expect(screen.queryByRole('heading', { name: '달걀' })).toBeNull()
  expect(vi.mocked(api.getActivity).mock.calls[1][2].aborted).toBe(true)
})

it('hides the old family records after permission is revoked and supports return to personal history', async () => {
  mount(); await ready()
  vi.mocked(api.getActivity).mockResolvedValue(response({ scope: 'refrigerator', refrigerator_name: '가족 냉장고' }))
  await userEvent.selectOptions(screen.getByLabelText('조회 범위'), '10')
  await screen.findByRole('heading', { name: '가족 냉장고 · 가족 기록 요약' })
  vi.mocked(api.getActivity).mockRejectedValueOnce(denied(403)).mockResolvedValue(response({ refrigerators: [] }))
  await userEvent.click(screen.getByRole('button', { name: '새로고침' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다')
  expect(screen.queryByRole('heading', { name: '상세 이력' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: '내 기록으로 돌아가기' }))
  await ready()
  expect(screen.queryByRole('option', { name: '가족 냉장고 · 가족 전체' })).toBeNull()
})

it('recovers from a network error without showing a false zero summary', async () => {
  vi.mocked(api.getActivity).mockRejectedValueOnce(new Error('network')).mockResolvedValue(response())
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('불러오지 못했습니다')
  expect(screen.queryByLabelText(/전체 처리/)).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
  await ready()
})

it('resets an expired page cursor on refresh', async () => {
  vi.mocked(api.getActivity).mockResolvedValueOnce(response({ next_cursor: 'expired-page' })).mockRejectedValueOnce(denied(400)).mockResolvedValue(response())
  mount(); await ready()
  await userEvent.click(screen.getByRole('button', { name: '다음 페이지' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('만료')
  await userEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
  await ready()
  expect(api.getActivity).toHaveBeenLastCalledWith(expect.anything(), null, expect.any(AbortSignal))
})

it('renders an empty history without removing filters or the chart', async () => {
  vi.mocked(api.getActivity).mockResolvedValue(response({ items: [], frequent_disposals: [], counts: { total: 0, consumed: 0, disposed: 0 } }))
  mount(); await ready()
  expect(screen.getByText('이 조건에 해당하는 기록이 없습니다.')).toBeVisible()
  expect(screen.getByText('이 조건에 해당하는 폐기 기록이 없습니다.')).toBeVisible()
  expect(screen.getByRole('img', { name: /일별 소비·폐기 건수/ })).toBeVisible()
  expect(screen.getByLabelText('조회 기간')).toBeEnabled()
})

it('aborts an in-flight request on unmount', async () => {
  vi.mocked(api.getActivity).mockReturnValue(new Promise(() => {}))
  const component = mount()
  const signal = vi.mocked(api.getActivity).mock.calls[0][2]
  component.unmount()
  expect(signal.aborted).toBe(true)
})

it('hides the previous account data and fridge choices while the next account loads', async () => {
  mount(); await ready()
  vi.mocked(api.getActivity).mockReturnValue(new Promise(() => {}))
  await act(async () => useAuthStore.setState({ user: { id: 2, nickname: '다른 계정', oauth_provider: 'kakao' } }))
  expect(screen.queryByRole('heading', { name: '상세 이력' })).toBeNull()
  expect(screen.queryByRole('option', { name: '가족 냉장고 · 가족 전체' })).toBeNull()
})
