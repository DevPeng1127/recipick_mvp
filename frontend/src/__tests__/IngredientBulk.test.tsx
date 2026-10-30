import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import BulkIngredientDialog from '../components/ingredient/BulkIngredientDialog'
import StorageBoxPage from '../pages/StorageBoxPage'
import { useIngredientStore } from '../stores/useIngredientStore'
import { useToastStore } from '../stores/useToastStore'
import * as api from '../api/ingredients'
import type { BulkIngredientAction } from '../types/ingredient'

vi.mock('../api/ingredientImport', () => ({ getImportStorageBox: async () => ({ id: 10, type: 'FRIDGE' }) }))
vi.mock('../api/ingredients')
const stock = [
  { id: 20, storage_box_id: 10, name: '우유', quantity: 2, unit: '팩', expiry_date: null },
  { id: 21, storage_box_id: 10, name: '당근', quantity: 1.5, unit: 'kg', expiry_date: '2026-12-31' },
  { id: 22, storage_box_id: 10, name: '남겨 둘 재료', quantity: 3, unit: '개', expiry_date: null },
]
const failure = (status: number) => new AxiosError('rejected', undefined, undefined, undefined, {
  status, statusText: 'Rejected', data: {}, headers: {}, config: { headers: new AxiosHeaders() },
})

beforeEach(() => {
  vi.resetAllMocks()
  useIngredientStore.setState(useIngredientStore.getInitialState(), true)
  useToastStore.setState({ toasts: [] })
  vi.mocked(api.listIngredientsByStorageBox).mockResolvedValue(stock)
  vi.mocked(api.bulkIngredientAction).mockResolvedValue(undefined)
})
afterEach(cleanup)

async function page() {
  const view = render(<MemoryRouter initialEntries={['/storage-boxes/10']}>
    <Link to="/storage-boxes/11">다른 보관함</Link>
    <Routes><Route path="/storage-boxes/:id" element={<StorageBoxPage />} /></Routes>
  </MemoryRouter>)
  await screen.findByText('우유')
  return view
}
async function selectTwo() {
  await userEvent.click(screen.getByRole('button', { name: '선택' }))
  await userEvent.click(screen.getByRole('checkbox', { name: '우유 선택' }))
  await userEvent.click(screen.getByRole('checkbox', { name: '당근 선택' }))
}

it('shows checkboxes only in selection mode, supports select all and resets on cancel', async () => {
  await page()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '선택' }))
  expect(screen.getByRole('button', { name: '선택한 0개 폐기' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '선택한 0개 삭제' })).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }))
  expect(screen.getByRole('button', { name: '선택한 3개 폐기' })).toBeEnabled()
  await userEvent.click(screen.getByRole('checkbox', { name: '우유 선택' }))
  expect(screen.getByRole('checkbox', { name: '전체 선택' })).not.toBeChecked()
  await userEvent.click(screen.getByRole('button', { name: '선택 취소' }))
  await userEvent.click(screen.getByRole('button', { name: '선택' }))
  expect(screen.getByRole('button', { name: '선택한 0개 삭제' })).toBeDisabled()
  expect(api.bulkIngredientAction).not.toHaveBeenCalled()
})

it.each(['delete', 'dispose'] as const)('confirms selected snapshots then performs exactly one batch %s', async action => {
  await page()
  await selectTwo()
  const label = action === 'delete' ? '삭제' : '폐기'
  await userEvent.click(screen.getByRole('button', { name: `선택한 2개 ${label}` }))
  expect(screen.getByRole('heading', { name: `선택한 2개 ${label} 확인` })).toBeVisible()
  const list = screen.getByRole('list', { name: '처리할 식재료' })
  expect(within(list).getByText('우유')).toBeVisible()
  expect(within(list).getByText('1.5kg')).toBeVisible()
  expect(within(list).queryByText('남겨 둘 재료')).not.toBeInTheDocument()
  expect(api.bulkIngredientAction).not.toHaveBeenCalled()
  if (action === 'dispose') {
    expect(screen.getByText(/남은 수량 전체/)).toBeVisible()
    await userEvent.type(screen.getByLabelText('공통 메모 (선택)'), ' 냉장고 정리 ')
  } else {
    expect(screen.getByText(/기존 이력은 유지/)).toBeVisible()
    expect(screen.queryByLabelText('공통 메모 (선택)')).not.toBeInTheDocument()
  }
  await userEvent.click(screen.getByRole('button', { name: `2개 ${label}하기` }))
  await waitFor(() => expect(screen.queryByRole('heading', { name: `선택한 2개 ${label} 확인` })).not.toBeInTheDocument())
  expect(api.bulkIngredientAction).toHaveBeenCalledExactlyOnceWith(10, {
    action, items: stock.slice(0, 2).map(({ id, name, quantity, unit, expiry_date }) => ({ id, name, quantity, unit, expiry_date })),
    ...(action === 'dispose' ? { memo: '냉장고 정리' } : {}),
  })
  expect(useIngredientStore.getState().ingredients).toEqual([stock[2]])
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(api.deleteIngredient).not.toHaveBeenCalled()
  expect(api.disposeIngredient).not.toHaveBeenCalled()
})

it('going back preserves selection and switching actions resets the confirmation', async () => {
  await page()
  await selectTwo()
  await userEvent.click(screen.getByRole('button', { name: '선택한 2개 폐기' }))
  await userEvent.type(screen.getByLabelText('공통 메모 (선택)'), '입력 중')
  await userEvent.click(screen.getByRole('button', { name: '돌아가기' }))
  expect(screen.getByRole('checkbox', { name: '우유 선택' })).toBeChecked()
  await userEvent.click(screen.getByRole('button', { name: '선택한 2개 삭제' }))
  expect(screen.queryByLabelText('공통 메모 (선택)')).not.toBeInTheDocument()
  expect(api.bulkIngredientAction).not.toHaveBeenCalled()
})

it.each([409, 403, 404, 422, 500, 0])('retains stock on %s and requires refreshing before another confirmation', async status => {
  vi.mocked(api.bulkIngredientAction).mockRejectedValue(status ? failure(status) : new AxiosError('network'))
  await page()
  await selectTwo()
  await userEvent.click(screen.getByRole('button', { name: '선택한 2개 폐기' }))
  await userEvent.click(screen.getByRole('button', { name: '2개 폐기하기' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('새로고침')
  expect(useIngredientStore.getState().ingredients).toEqual(stock)
  expect(screen.queryByRole('button', { name: '2개 폐기하기' })).not.toBeInTheDocument()
  // A lost response may have succeeded: reload the server's remaining inventory.
  vi.mocked(api.listIngredientsByStorageBox).mockResolvedValue([stock[2]])
  await userEvent.click(screen.getByRole('button', { name: '목록 새로고침' }))
  await screen.findByText('남겨 둘 재료')
  expect(screen.queryByText('우유')).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(api.bulkIngredientAction).toHaveBeenCalledTimes(1)
})

function dialog(action: BulkIngredientAction, onConfirm: () => Promise<void>) {
  const onComplete = vi.fn(), onClose = vi.fn()
  return { ...render(<BulkIngredientDialog action={action} ingredients={stock} onConfirm={onConfirm}
    onComplete={onComplete} onClose={onClose} onRefresh={vi.fn()} />), onComplete, onClose }
}

it('locks duplicate submissions and closing until completion', async () => {
  let resolve!: () => void
  const onConfirm = vi.fn(() => new Promise<void>(done => { resolve = done }))
  const { onComplete, onClose } = dialog('dispose', onConfirm)
  const button = screen.getByRole('button', { name: '3개 폐기하기' })
  act(() => { fireEvent.click(button); fireEvent.click(button) })
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '돌아가기' })).toBeDisabled()
  expect(screen.getByLabelText('공통 메모 (선택)')).toBeDisabled()
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => resolve())
  expect(onComplete).toHaveBeenCalledTimes(1)
})

it('ignores late completions after leaving the confirmation', async () => {
  let resolve!: () => void
  const { unmount, onComplete } = dialog('delete', () => new Promise<void>(done => { resolve = done }))
  await userEvent.click(screen.getByRole('button', { name: '3개 삭제하기' }))
  unmount()
  await act(async () => resolve())
  expect(onComplete).not.toHaveBeenCalled()
  expect(useToastStore.getState().toasts).toEqual([])
})

it('resets selection and dialog when navigating to another storage box', async () => {
  await page()
  await selectTwo()
  await userEvent.click(screen.getByRole('button', { name: '선택한 2개 삭제' }))
  vi.mocked(api.listIngredientsByStorageBox).mockResolvedValue([{ ...stock[0], id: 30, storage_box_id: 11, name: '다른 식재료' }])
  await userEvent.click(screen.getByRole('link', { name: '다른 보관함' }))
  await screen.findByText('다른 식재료')
  expect(screen.queryByRole('heading', { name: '선택한 2개 삭제 확인' })).not.toBeInTheDocument()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(api.bulkIngredientAction).not.toHaveBeenCalled()
})

it('does not offer selection for an empty box', async () => {
  vi.mocked(api.listIngredientsByStorageBox).mockResolvedValue([])
  render(<MemoryRouter initialEntries={['/storage-boxes/10']}><Routes><Route path="/storage-boxes/:id" element={<StorageBoxPage />} /></Routes></MemoryRouter>)
  await screen.findByText('식재료가 없습니다')
  expect(screen.getByRole('button', { name: '선택' })).toBeDisabled()
})
