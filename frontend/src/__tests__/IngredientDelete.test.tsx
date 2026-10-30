import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import EditIngredientModal from '../components/ingredient/EditIngredientModal'
import StorageBoxPage from '../pages/StorageBoxPage'
import { useIngredientStore } from '../stores/useIngredientStore'
import { useToastStore } from '../stores/useToastStore'
import * as api from '../api/ingredients'

vi.mock('../api/ingredients')
const ingredient = { id: 20, storage_box_id: 10, name: '잘못 등록한 우유', quantity: 2, unit: '팩', expiry_date: null }
const failure = (status: number) => new AxiosError('rejected', undefined, undefined, undefined, {
  status, statusText: 'Rejected', data: {}, headers: {}, config: { headers: new AxiosHeaders() },
})

beforeEach(() => {
  vi.resetAllMocks()
  useIngredientStore.setState(useIngredientStore.getInitialState(), true)
  useToastStore.setState({ toasts: [] })
})
afterEach(cleanup)

function open(overrides = {}) {
  const props = { isOpen: true, ingredient, onClose: vi.fn(), onSave: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn().mockResolvedValue(undefined), ...overrides }
  const view = render(<EditIngredientModal {...props} />)
  return { ...view, ...props }
}

it('requires confirmation and preserves unsaved edits when going back', async () => {
  const { onDelete, onSave } = open()
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText('이름'))
  await user.type(screen.getByLabelText('이름'), '수정 중인 이름')
  await user.click(screen.getByRole('button', { name: '식재료 삭제' }))
  expect(screen.getByRole('heading', { name: '식재료 삭제 확인' })).toBeVisible()
  expect(screen.getByText('잘못 등록한 우유')).toBeVisible()
  expect(screen.getByText(/복구할 수 없습니다/)).toBeVisible()
  expect(screen.getByText(/기존 소비·폐기 이력은 유지/)).toBeVisible()
  expect(onDelete).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '돌아가기' }))
  expect(screen.getByLabelText('이름')).toHaveValue('수정 중인 이름')
  expect(onSave).not.toHaveBeenCalled()
})

it('deletes the persisted item even if unsaved edit fields are invalid', async () => {
  const { onDelete, onSave, onClose } = open()
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText('이름'))
  await user.clear(screen.getByLabelText('수량'))
  await user.click(screen.getByRole('button', { name: '식재료 삭제' }))
  await user.click(screen.getByRole('button', { name: '삭제하기' }))
  expect(onDelete).toHaveBeenCalledTimes(1)
  expect(onSave).not.toHaveBeenCalled()
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('locks repeated deletes and closing until the request finishes', async () => {
  let resolve!: () => void
  const onDelete = vi.fn(() => new Promise<void>(finish => { resolve = finish }))
  const { onClose } = open({ onDelete })
  await userEvent.click(screen.getByRole('button', { name: '식재료 삭제' }))
  const button = screen.getByRole('button', { name: '삭제하기' })
  act(() => { fireEvent.click(button); fireEvent.click(button) })
  expect(onDelete).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '돌아가기' })).toBeDisabled()
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => resolve())
  expect(onClose).toHaveBeenCalledTimes(1)
})

it.each([403, 404, 500])('keeps the confirmation open on failure %s and allows retry', async status => {
  const onDelete = vi.fn().mockRejectedValueOnce(failure(status)).mockResolvedValue(undefined)
  const { onClose } = open({ onDelete })
  await userEvent.click(screen.getByRole('button', { name: '식재료 삭제' }))
  await userEvent.click(screen.getByRole('button', { name: '삭제하기' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(status === 403 ? '권한' : status === 404 ? '찾을 수 없습니다' : '삭제 완료를 확인하지 못했습니다')
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByText('잘못 등록한 우유')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: '삭제하기' }))
  expect(onDelete).toHaveBeenCalledTimes(2)
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('does not allow deletion or closing during a save and preserves edits after failure', async () => {
  let reject!: (reason: unknown) => void
  const onSave = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail }))
  const { onDelete, onClose } = open({ onSave })
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  expect(screen.getByRole('button', { name: '식재료 삭제' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled()
  expect(screen.getByLabelText('이름')).toBeDisabled()
  await act(async () => reject(new Error('offline')))
  expect(await screen.findByRole('alert')).toHaveTextContent('수정하지 못했습니다')
  expect(screen.getByLabelText('이름')).toHaveValue(ingredient.name)
  expect(onDelete).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})

it('ignores late completion after leaving the modal', async () => {
  let resolve!: () => void
  const { unmount, onClose } = open({ onDelete: () => new Promise<void>(finish => { resolve = finish }) })
  await userEvent.click(screen.getByRole('button', { name: '식재료 삭제' }))
  await userEvent.click(screen.getByRole('button', { name: '삭제하기' }))
  unmount()
  await act(async () => resolve())
  expect(onClose).not.toHaveBeenCalled()
  expect(useToastStore.getState().toasts).toEqual([])
})

it('keeps page stock after a lost response and removes only the selected item after a safe retry', async () => {
  const other = { ...ingredient, id: 21, name: '남겨 둘 식재료' }
  vi.mocked(api.listIngredientsByStorageBox).mockResolvedValue([ingredient, other])
  vi.mocked(api.deleteIngredient).mockRejectedValueOnce(new AxiosError('network')).mockResolvedValue(undefined)
  render(<MemoryRouter initialEntries={['/storage-boxes/10']}><Routes>
    <Route path="/storage-boxes/:id" element={<StorageBoxPage />} />
  </Routes></MemoryRouter>)
  await screen.findByText(ingredient.name)
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: '' })[0])
  await user.click(screen.getByRole('button', { name: '수정/삭제' }))
  await user.click(screen.getByRole('button', { name: '식재료 삭제' }))
  expect(api.deleteIngredient).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '삭제하기' }))
  await screen.findByRole('alert')
  expect(useIngredientStore.getState().ingredients).toEqual([ingredient, other])
  await user.click(screen.getByRole('button', { name: '삭제하기' }))
  await waitFor(() => expect(screen.queryByRole('heading', { name: '식재료 삭제 확인' })).not.toBeInTheDocument())
  expect(useIngredientStore.getState().ingredients).toEqual([other])
  expect(screen.queryByText(ingredient.name)).not.toBeInTheDocument()
  expect(api.deleteIngredient).toHaveBeenNthCalledWith(1, 10, 20)
  expect(api.deleteIngredient).toHaveBeenNthCalledWith(2, 10, 20)
  expect(api.consumeIngredient).not.toHaveBeenCalled()
  expect(api.disposeIngredient).not.toHaveBeenCalled()
})
