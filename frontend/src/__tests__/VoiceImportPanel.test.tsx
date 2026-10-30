import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import VoiceImportPanel from '../components/ingredient/VoiceImportPanel'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { previewVoice } from '../api/voiceImport'

vi.mock('../hooks/useVoiceRecorder', () => ({ useVoiceRecorder: vi.fn() }))
vi.mock('../api/voiceImport', () => ({ previewVoice: vi.fn() }))
const recorder = { status: 'ready' as const, elapsed: 5, file: new File(['wav'], 'voice.wav', { type: 'audio/wav' }), error: null, start: vi.fn(), stop: vi.fn(), cancel: vi.fn() }
const milk = { source_text: '우유 두 팩', name: '우유', quantity: 2, unit: '팩', needs_review: false }
beforeEach(() => {
  vi.mocked(useVoiceRecorder).mockReturnValue({ ...recorder })
  vi.mocked(previewVoice).mockReset().mockResolvedValue({ items: [milk], has_more: false })
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:voice'), revokeObjectURL: vi.fn() }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('waits for explicit recognition and saves only after review', async () => {
  const save = vi.fn().mockResolvedValue(undefined)
  render(<VoiceImportPanel storageBoxId={100} onSave={save} onClose={vi.fn()} />)
  expect(previewVoice).not.toHaveBeenCalled()
  expect(screen.getByLabelText('녹음 미리듣기')).toBeVisible()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '음성 인식하기' }))
  await screen.findByLabelText('식재료 이름 1')
  expect(save).not.toHaveBeenCalled()
  expect(screen.getByLabelText('기한 구분 1')).toHaveValue('unknown')
  await user.clear(screen.getByLabelText('수량 1'))
  await user.type(screen.getByLabelText('수량 1'), '3')
  await user.click(screen.getByRole('button', { name: '선택한 1개 등록' }))
  expect(save).toHaveBeenCalledWith([{ name: '우유', quantity: 3, unit: '팩', expiry_date: null, expiry_source: 'unknown' }])
})

it('keeps the recording on provider quota failure without another automatic call', async () => {
  vi.mocked(previewVoice).mockRejectedValue(new AxiosError('quota', undefined, undefined, undefined, {
    status: 429, statusText: 'Too Many Requests', data: { detail: { message: 'AI 한도 초과', retry_after_seconds: 12 } }, headers: {}, config: { headers: new AxiosHeaders() },
  }))
  render(<VoiceImportPanel storageBoxId={100} onSave={vi.fn()} onClose={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: '음성 인식하기' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('12초')
  expect(screen.getByLabelText('녹음 미리듣기')).toBeVisible()
  expect(previewVoice).toHaveBeenCalledTimes(1)
})

it('shows an empty result for unrelated speech without a save button', async () => {
  vi.mocked(previewVoice).mockResolvedValue({ items: [], has_more: false })
  render(<VoiceImportPanel storageBoxId={100} onSave={vi.fn()} onClose={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: '음성 인식하기' }))
  expect(await screen.findByText(/식재료를 찾지 못했습니다/)).toBeVisible()
  expect(screen.queryByRole('button', { name: /선택한/ })).not.toBeInTheDocument()
})

it('aborts recognition when the panel is closed or the route changes', async () => {
  let signal: AbortSignal | undefined
  vi.mocked(previewVoice).mockImplementation((_id, _file, requestSignal) => {
    signal = requestSignal
    return new Promise(() => {})
  })
  const { unmount } = render(<VoiceImportPanel storageBoxId={100} onSave={vi.fn()} onClose={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: '음성 인식하기' }))
  await waitFor(() => expect(signal).toBeDefined())
  act(() => unmount())
  expect(signal?.aborted).toBe(true)
})
