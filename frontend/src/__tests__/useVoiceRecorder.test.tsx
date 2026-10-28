import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useVoiceRecorder } from '../hooks/useVoiceRecorder'
import { normalizeRecordedAudio } from '../utils/voiceAudio'

vi.mock('../utils/voiceAudio', () => ({ normalizeRecordedAudio: vi.fn() }))
const normalize = vi.mocked(normalizeRecordedAudio)
const trackStop = vi.fn()
const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream
const getUserMedia = vi.fn()
class Recorder {
  static instances: Recorder[] = []
  static isTypeSupported() { return true }
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['recorded']) })
    this.onstop?.()
  }
  constructor() { Recorder.instances.push(this) }
}

beforeEach(() => {
  Recorder.instances = []
  trackStop.mockReset(); getUserMedia.mockReset(); normalize.mockReset()
  getUserMedia.mockResolvedValue(stream)
  normalize.mockResolvedValue(new File(['wav'], 'voice.wav', { type: 'audio/wav' }))
  vi.stubGlobal('MediaRecorder', Recorder)
  vi.stubGlobal('OfflineAudioContext', class {})
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('records only on request and releases microphone before preview', async () => {
  const { result } = renderHook(() => useVoiceRecorder())
  expect(getUserMedia).not.toHaveBeenCalled()
  await act(async () => result.current.start())
  expect(result.current.status).toBe('recording')
  await act(async () => result.current.stop())
  expect(result.current.file?.type).toBe('audio/wav')
  expect(trackStop).toHaveBeenCalledTimes(1)
  expect(normalize).toHaveBeenCalledTimes(1)
})

it('explains denied permission and permits another attempt', async () => {
  getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
  const { result } = renderHook(() => useVoiceRecorder())
  await act(async () => result.current.start())
  expect(result.current.error).toMatch(/마이크.*허용/)
  expect(result.current.status).toBe('idle')
  await act(async () => result.current.start())
  expect(result.current.status).toBe('recording')
})

it('cancels pending permission and stops a stream returned after unmount', async () => {
  let finish!: (stream: MediaStream) => void
  getUserMedia.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { result, unmount } = renderHook(() => useVoiceRecorder())
  act(() => { void result.current.start() })
  unmount()
  await act(async () => finish(stream))
  expect(trackStop).toHaveBeenCalledTimes(1)
  expect(Recorder.instances).toHaveLength(0)
})

it('stops at sixty seconds without uploading', async () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useVoiceRecorder())
  await act(async () => result.current.start())
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  expect(result.current.file).not.toBeNull()
  expect(trackStop).toHaveBeenCalledTimes(1)
  expect(result.current.elapsed).toBe(60)
})

it('discards cancelled audio and releases the device', async () => {
  const { result } = renderHook(() => useVoiceRecorder())
  await act(async () => result.current.start())
  act(() => result.current.cancel())
  expect(result.current.status).toBe('idle')
  expect(result.current.file).toBeNull()
  expect(trackStop).toHaveBeenCalledTimes(1)
  expect(normalize).not.toHaveBeenCalled()
})

it('stops active tracks on navigation without retaining a recording', async () => {
  const { result, unmount } = renderHook(() => useVoiceRecorder())
  await act(async () => result.current.start())
  unmount()
  expect(trackStop).toHaveBeenCalledTimes(1)
  expect(normalize).not.toHaveBeenCalled()
})

it('reports decode failure and allows recording again', async () => {
  normalize.mockRejectedValueOnce(new Error('decoder rejected input'))
  const { result } = renderHook(() => useVoiceRecorder())
  await act(async () => result.current.start())
  await act(async () => result.current.stop())
  await waitFor(() => expect(result.current.error).toMatch(/다시 녹음/))
  expect(result.current.file).toBeNull()
  expect(trackStop).toHaveBeenCalledTimes(1)
})

it('blocks recording on unsupported or insecure pages without asking permission', async () => {
  vi.stubGlobal('isSecureContext', false)
  const { result } = renderHook(() => useVoiceRecorder())
  await act(async () => result.current.start())
  expect(getUserMedia).not.toHaveBeenCalled()
  expect(result.current.error).toMatch(/HTTPS|localhost/)
})

it('ends recording and releases the microphone when the page becomes hidden', async () => {
  const { result } = renderHook(() => useVoiceRecorder())
  await act(async () => result.current.start())
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(trackStop).toHaveBeenCalledTimes(1)
  expect(result.current.status).toBe('ready')
  expect(result.current.file?.type).toBe('audio/wav')
})

it('releases a late permission grant without starting to record on a hidden page', async () => {
  let finish!: (stream: MediaStream) => void
  getUserMedia.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { result } = renderHook(() => useVoiceRecorder())
  act(() => { void result.current.start() })
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  await act(async () => finish(stream))
  expect(Recorder.instances).toHaveLength(0)
  expect(trackStop).toHaveBeenCalledTimes(1)
  expect(result.current.status).toBe('idle')
  expect(result.current.error).toMatch(/화면이 비활성화/)
  expect(normalize).not.toHaveBeenCalled()
})

it('does not restore a cancelled recording when decoding finishes late', async () => {
  let finish!: (file: File) => void
  normalize.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const { result } = renderHook(() => useVoiceRecorder())
  await act(async () => result.current.start())
  act(() => result.current.stop())
  expect(result.current.status).toBe('processing')
  act(() => result.current.cancel())
  await act(async () => finish(new File(['wav'], 'voice.wav', { type: 'audio/wav' })))
  expect(result.current.status).toBe('idle')
  expect(result.current.file).toBeNull()
  expect(trackStop).toHaveBeenCalledTimes(1)
})
