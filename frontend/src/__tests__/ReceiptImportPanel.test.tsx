import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import ReceiptImportPanel from '../components/ingredient/ReceiptImportPanel'
import { previewReceipt } from '../api/receiptImport'

vi.mock('../api/receiptImport', () => ({ previewReceipt: vi.fn() }))
const preview = vi.mocked(previewReceipt)
const milk = { source_text: '우유 1L', name: '우유 1L', quantity: 2, unit: '팩', needs_review: false }
const apple = { source_text: '사과', name: '사과', quantity: null, unit: null, needs_review: true }
const file = () => new File(['test image'], 'receipt.png', { type: 'image/png' })

beforeEach(() => {
  preview.mockReset()
  preview.mockResolvedValue({ items: [milk, apple], has_more: false })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:receipt'), revokeObjectURL: vi.fn() }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function selectAndAnalyze() {
  const user = userEvent.setup()
  await user.upload(screen.getByLabelText('영수증 사진'), file())
  await user.click(screen.getByRole('button', { name: '사진 인식하기' }))
  await screen.findByLabelText('식재료 이름 1')
  return user
}

it('requires review, edits candidates, excludes a row and saves only confirmed data', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  render(<ReceiptImportPanel storageBoxId={100} onSave={onSave} onClose={onClose} />)
  const user = await selectAndAnalyze()
  expect(onSave).not.toHaveBeenCalled()
  expect(screen.getByLabelText('유통기한 1')).toHaveValue('')
  expect(screen.getByText('확인 필요')).toBeVisible()
  await user.clear(screen.getByLabelText('식재료 이름 1'))
  await user.type(screen.getByLabelText('식재료 이름 1'), '저지방 우유 1L')
  await user.click(screen.getByLabelText('항목 2 포함'))
  await user.click(screen.getByRole('button', { name: '선택한 1개 등록' }))
  expect(onSave).toHaveBeenCalledWith([{ name: '저지방 우유 1L', quantity: 2, unit: '팩', expiry_date: null }])
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
})

it('requires missing quantities and units before saving', async () => {
  const onSave = vi.fn()
  render(<ReceiptImportPanel storageBoxId={100} onSave={onSave} onClose={vi.fn()} />)
  const user = await selectAndAnalyze()
  await user.click(screen.getByRole('button', { name: '선택한 2개 등록' }))
  expect(onSave).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('수량')
  await user.type(screen.getByLabelText('수량 2'), '3')
  await user.type(screen.getByLabelText('단위 2'), '개')
  await user.click(screen.getByRole('button', { name: '선택한 2개 등록' }))
  expect(onSave).toHaveBeenCalledTimes(1)
})

it('blocks duplicate saves and edits while saving', async () => {
  preview.mockResolvedValue({ items: [milk], has_more: false })
  let finish!: () => void
  const onSave = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const onClose = vi.fn()
  render(<ReceiptImportPanel storageBoxId={100} onSave={onSave} onClose={onClose} />)
  await selectAndAnalyze()
  const button = screen.getByRole('button', { name: '선택한 1개 등록' })
  act(() => { fireEvent.click(button); fireEvent.click(button) })
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('식재료 이름 1')).toBeDisabled()
  expect(screen.getByRole('button', { name: '영수증 입력 닫기' })).toBeDisabled()
  await act(async () => finish())
})

it('keeps edits after a rejected save and allows correction', async () => {
  preview.mockResolvedValue({ items: [milk], has_more: false })
  const error = new AxiosError('validation', 'ERR_BAD_REQUEST', undefined, undefined,
    { status: 422, statusText: 'Unprocessable', data: {}, headers: {}, config: { headers: new AxiosHeaders() } })
  const onSave = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined)
  render(<ReceiptImportPanel storageBoxId={100} onSave={onSave} onClose={vi.fn()} />)
  const user = await selectAndAnalyze()
  await user.click(screen.getByRole('button', { name: '선택한 1개 등록' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('식재료 이름 1')).toHaveValue('우유 1L')
  await user.click(screen.getByRole('button', { name: '선택한 1개 등록' }))
  expect(onSave).toHaveBeenCalledTimes(2)
})

it('does not blindly retry a save with an unknown network outcome', async () => {
  preview.mockResolvedValue({ items: [milk], has_more: false })
  const onSave = vi.fn().mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'))
  render(<ReceiptImportPanel storageBoxId={100} onSave={onSave} onClose={vi.fn()} />)
  const user = await selectAndAnalyze()
  await user.click(screen.getByRole('button', { name: '선택한 1개 등록' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('재고 목록')
  expect(screen.getByRole('button', { name: '선택한 1개 등록' })).toBeDisabled()
  expect(screen.getByLabelText('식재료 이름 1')).toHaveValue('우유 1L')
})

describe('recognition states', () => {
  it('shows empty and truncated results', async () => {
    preview.mockResolvedValueOnce({ items: [], has_more: false })
      .mockResolvedValueOnce({ items: [milk], has_more: true })
    render(<ReceiptImportPanel storageBoxId={100} onSave={vi.fn()} onClose={vi.fn()} />)
    const user = userEvent.setup()
    await user.upload(screen.getByLabelText('영수증 사진'), file())
    await user.click(screen.getByRole('button', { name: '사진 인식하기' }))
    expect(await screen.findByText(/등록할 식재료를 찾지 못했습니다/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: '사진 인식하기' }))
    expect(await screen.findByText(/20개를 초과/)).toBeVisible()
  })

  it('retains the selected photo after provider failure', async () => {
    preview.mockRejectedValueOnce(new Error('unavailable'))
    render(<ReceiptImportPanel storageBoxId={100} onSave={vi.fn()} onClose={vi.fn()} />)
    const user = userEvent.setup()
    await user.upload(screen.getByLabelText('영수증 사진'), file())
    await user.click(screen.getByRole('button', { name: '사진 인식하기' }))
    await screen.findByRole('alert')
    expect(screen.getByAltText('선택한 영수증')).toBeVisible()
    expect(screen.getByRole('button', { name: '사진 인식하기' })).toBeEnabled()
  })
})
