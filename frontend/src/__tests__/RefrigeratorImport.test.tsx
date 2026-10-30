import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import IngredientImportPage from '../pages/IngredientImportPage'
import ImportEntry from '../components/ingredient/ImportEntry'
import { getRefrigerator, listRefrigerators } from '../api/refrigerators'
import { createDistributedIngredients, getImportStorageBox, previewRefrigeratorImport } from '../api/ingredientImport'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'

vi.mock('../api/refrigerators', () => ({ getRefrigerator: vi.fn(), listRefrigerators: vi.fn() }))
vi.mock('../api/ingredientImport', () => ({ createDistributedIngredients: vi.fn(), getImportStorageBox: vi.fn(), previewRefrigeratorImport: vi.fn() }))
vi.mock('../hooks/useVoiceRecorder', () => ({ useVoiceRecorder: vi.fn() }))
const fridge = { id: 10, name: '우리 냉장고', role: 'GUEST' as const, created_at: '', is_favorite: false, top_ingredients: [], total_ingredient_count: 0 }
const boxes = [{ id: 100, refrigerator_id: 10, name: '냉장실', type: 'FRIDGE' as const },
  { id: 101, refrigerator_id: 10, name: '냉동실', type: 'FREEZER' as const }]
const items = ['우유', '만두', '사과'].map(name => ({ name, source_text: name, quantity: 1, unit: '개', needs_review: false }))
const apiError = (status: number) => new AxiosError('rejected', undefined, undefined, undefined, {
  status, statusText: 'Rejected', data: {}, headers: {}, config: { headers: new AxiosHeaders() },
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listRefrigerators).mockResolvedValue([fridge])
  vi.mocked(getRefrigerator).mockResolvedValue({ ...fridge, members: [], storage_boxes: boxes })
  vi.mocked(getImportStorageBox).mockResolvedValue(boxes[0])
  vi.mocked(previewRefrigeratorImport).mockResolvedValue({ items, has_more: false })
  vi.mocked(createDistributedIngredients).mockResolvedValue([])
  vi.mocked(useVoiceRecorder).mockReturnValue({ status: 'ready', elapsed: 5,
    file: new File(['wav'], 'voice.wav', { type: 'audio/wav' }), error: null, start: vi.fn(), stop: vi.fn(), cancel: vi.fn() })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function open(query = '?mode=receipt') {
  return render(<MemoryRouter initialEntries={[`/ingredients/import${query}`]}><Routes>
    <Route path="/ingredients/import" element={<IngredientImportPage />} />
    <Route path="/refrigerators/:id" element={<div>냉장고 복귀 완료</div>} />
    <Route path="/storage-boxes/:id" element={<div>보관함 복귀 완료</div>} />
  </Routes></MemoryRouter>)
}
async function start(mode = '영수증') {
  const user = userEvent.setup()
  await screen.findByLabelText('등록할 냉장고')
  await user.click(screen.getByRole('button', { name: `${mode} 입력 시작` }))
  await screen.findByRole('button', { name: `${mode} 입력 닫기` })
  return user
}
async function recognize(mode = '영수증') {
  const user = await start(mode)
  if (mode === '영수증') await user.upload(screen.getByLabelText('영수증 사진'), new File(['png'], 'receipt.png', { type: 'image/png' }))
  await user.click(screen.getByRole('button', { name: `${mode === '영수증' ? '사진' : '음성'} 인식하기` }))
  await screen.findByLabelText('보관함 1')
  return user
}

it('requires a fridge choice when several exist and makes no automatic AI call', async () => {
  vi.mocked(listRefrigerators).mockResolvedValue([fridge, { ...fridge, id: 20, name: '두 번째 냉장고' }])
  open()
  expect(await screen.findByLabelText('등록할 냉장고')).toHaveValue('')
  expect(screen.getByRole('button', { name: '영수증 입력 시작' })).toBeDisabled()
  expect(getRefrigerator).not.toHaveBeenCalled()
  expect(previewRefrigeratorImport).not.toHaveBeenCalled()
  await userEvent.selectOptions(screen.getByLabelText('등록할 냉장고'), '10')
  await start()
  expect(getRefrigerator).toHaveBeenCalledWith(10)
})

it('auto-selects the only fridge and distributes reviewed rows with one save', async () => {
  open()
  expect(await screen.findByLabelText('등록할 냉장고')).toHaveValue('10')
  const user = await recognize()
  expect(previewRefrigeratorImport).toHaveBeenCalledWith(10, 'receipt', expect.any(File), expect.any(AbortSignal))
  expect(screen.getByLabelText('유통기한 1')).toHaveValue('')
  await user.click(screen.getByRole('button', { name: '선택한 3개 등록' }))
  expect(screen.getByRole('alert')).toHaveTextContent('모든 식재료의 보관함')
  expect(createDistributedIngredients).not.toHaveBeenCalled()
  await user.click(screen.getByLabelText('항목 3 포함'))
  await user.selectOptions(screen.getByLabelText('포함된 항목의 보관함 일괄 지정'), '100')
  await user.click(screen.getByRole('button', { name: '포함된 2개에 적용' }))
  expect(screen.getByLabelText('보관함 3')).toHaveValue('')
  await user.selectOptions(screen.getByLabelText('보관함 2'), '101')
  await user.clear(screen.getByLabelText('식재료 이름 1'))
  await user.type(screen.getByLabelText('식재료 이름 1'), '수정한 우유')
  await user.click(screen.getByRole('button', { name: '선택한 2개 등록' }))
  expect(createDistributedIngredients).toHaveBeenCalledExactlyOnceWith(10, [
    { name: '수정한 우유', quantity: 1, unit: '개', expiry_date: null, storage_box_id: 100 },
    { name: '만두', quantity: 1, unit: '개', expiry_date: null, storage_box_id: 101 },
  ])
  expect(await screen.findByText('냉장고 복귀 완료')).toBeVisible()
})

it('keeps storage entry default while allowing voice items to use another box', async () => {
  open('?mode=voice&storageBox=100')
  const user = await recognize('음성')
  expect(getImportStorageBox).toHaveBeenCalledWith(100)
  expect(previewRefrigeratorImport).toHaveBeenCalledWith(10, 'voice', expect.any(File), expect.any(AbortSignal))
  expect(screen.getByLabelText('보관함 1')).toHaveValue('100')
  await user.selectOptions(screen.getByLabelText('보관함 2'), '101')
  await user.click(screen.getByRole('button', { name: '선택한 3개 등록' }))
  expect(vi.mocked(createDistributedIngredients).mock.calls[0][1].map(item => item.storage_box_id)).toEqual([100, 101, 100])
  expect(await screen.findByText('보관함 복귀 완료')).toBeVisible()
})

it('clears the default box when the user changes fridges before recognition', async () => {
  vi.mocked(listRefrigerators).mockResolvedValue([fridge, { ...fridge, id: 20 }])
  open('?mode=receipt&storageBox=100')
  await screen.findByLabelText('등록할 냉장고')
  await userEvent.selectOptions(screen.getByLabelText('등록할 냉장고'), '20')
  vi.mocked(getRefrigerator).mockResolvedValue({ ...fridge, id: 20, members: [], storage_boxes: [{ ...boxes[0], id: 200, refrigerator_id: 20 }] })
  await recognize()
  expect(screen.getByLabelText('보관함 1')).toHaveValue('')
  expect(previewRefrigeratorImport).toHaveBeenCalledWith(20, 'receipt', expect.any(File), expect.any(AbortSignal))
})

it('retains edits and requires reassignment after a deleted destination', async () => {
  open('?mode=receipt&storageBox=100')
  const user = await recognize()
  await user.clear(screen.getByLabelText('수량 1'))
  await user.type(screen.getByLabelText('수량 1'), '5')
  vi.mocked(createDistributedIngredients).mockRejectedValueOnce(apiError(409))
  vi.mocked(getRefrigerator).mockResolvedValue({ ...fridge, members: [], storage_boxes: [boxes[1]] })
  await user.click(screen.getByRole('button', { name: '선택한 3개 등록' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('아무것도 저장하지 않았습니다')
  expect(screen.getByLabelText('수량 1')).toHaveValue(5)
  await user.click(screen.getByRole('button', { name: '선택한 3개 등록' }))
  expect(createDistributedIngredients).toHaveBeenCalledTimes(1)
  await user.selectOptions(screen.getByLabelText('포함된 항목의 보관함 일괄 지정'), '101')
  await user.click(screen.getByRole('button', { name: '포함된 3개에 적용' }))
  await user.click(screen.getByRole('button', { name: '선택한 3개 등록' }))
  expect(createDistributedIngredients).toHaveBeenCalledTimes(2)
})

it('preserves the draft even if every destination was deleted', async () => {
  open('?mode=receipt&storageBox=100')
  const user = await recognize()
  vi.mocked(createDistributedIngredients).mockRejectedValueOnce(apiError(409))
  vi.mocked(getRefrigerator).mockResolvedValue({ ...fridge, members: [], storage_boxes: [] })
  await user.click(screen.getByRole('button', { name: '선택한 3개 등록' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('식재료 이름 1')).toHaveValue('우유')
  expect(screen.getByRole('button', { name: '사진 인식하기' })).toBeDisabled()
})

it.each([403, 422])('retains assignments on known save rejection %s', async status => {
  open('?mode=receipt&storageBox=100')
  const user = await recognize()
  vi.mocked(createDistributedIngredients).mockRejectedValueOnce(apiError(status))
  await user.click(screen.getByRole('button', { name: '선택한 3개 등록' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('보관함 1')).toHaveValue('100')
  expect(screen.getByLabelText('식재료 이름 1')).toHaveValue('우유')
})

it('locks duplicate submits and prevents blind retry after uncertain save', async () => {
  open('?mode=receipt&storageBox=100')
  await recognize()
  let reject!: (reason: unknown) => void
  vi.mocked(createDistributedIngredients).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
  const button = screen.getByRole('button', { name: '선택한 3개 등록' })
  act(() => { fireEvent.click(button); fireEvent.click(button) })
  expect(createDistributedIngredients).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('보관함 1')).toBeDisabled()
  await act(async () => reject(new AxiosError('network')))
  expect(await screen.findByRole('alert')).toHaveTextContent('재고 목록')
  expect(screen.getByRole('button', { name: '선택한 3개 등록' })).toBeDisabled()
})

it('does not recognize without a fridge or without boxes', async () => {
  vi.mocked(getRefrigerator).mockResolvedValue({ ...fridge, members: [], storage_boxes: [] })
  open()
  await start()
  expect(screen.getByText(/소유자가 보관함을 추가하면/)).toBeVisible()
  expect(screen.getByLabelText('영수증 사진')).toBeDisabled()
  expect(previewRefrigeratorImport).not.toHaveBeenCalled()
})

it('does not fall back to another fridge when a deep link is unauthorized', async () => {
  open('?mode=receipt&refrigerator=999')
  expect(await screen.findByRole('alert')).toHaveTextContent('접근 권한')
  expect(screen.queryByLabelText('등록할 냉장고')).not.toBeInTheDocument()
  expect(previewRefrigeratorImport).not.toHaveBeenCalled()
})

it('aborts recognition when navigating away', async () => {
  let signal: AbortSignal | undefined
  vi.mocked(previewRefrigeratorImport).mockImplementation((_id, _mode, _file, requestSignal) => {
    signal = requestSignal
    return new Promise(() => {})
  })
  const view = open('?mode=voice')
  await start('음성')
  await userEvent.click(screen.getByRole('button', { name: '음성 인식하기' }))
  await waitFor(() => expect(signal).toBeDefined())
  view.unmount()
  expect(signal?.aborted).toBe(true)
})

it('provides context-preserving entry links from all three screens', () => {
  const view = render(<MemoryRouter><ImportEntry /></MemoryRouter>)
  expect(screen.getByRole('link', { name: '영수증으로 등록' })).toHaveAttribute('href', '/ingredients/import?mode=receipt')
  view.rerender(<MemoryRouter><ImportEntry refrigeratorId={10} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: '음성으로 등록' })).toHaveAttribute('href', '/ingredients/import?mode=voice&refrigerator=10')
  view.rerender(<MemoryRouter><ImportEntry storageBoxId={100} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: '영수증으로 등록' })).toHaveAttribute('href', '/ingredients/import?mode=receipt&storageBox=100')
})
