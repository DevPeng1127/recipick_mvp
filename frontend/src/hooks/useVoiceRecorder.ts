import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeRecordedAudio } from '../utils/voiceAudio'

type Status = 'idle' | 'requesting' | 'recording' | 'processing' | 'ready'
const MAX_RECORDING_BYTES = 5 * 1024 * 1024

export function useVoiceRecorder() {
  const [status, setStatus] = useState<Status>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(false)
  const mounted = useRef(true)
  const generation = useRef(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const limitTimer = useRef<ReturnType<typeof setTimeout>>()
  const progressTimer = useRef<ReturnType<typeof setInterval>>()

  const release = useCallback(() => {
    clearTimeout(limitTimer.current); clearInterval(progressTimer.current)
    const current = recorder.current
    recorder.current = null
    if (current) {
      current.onstop = null; current.ondataavailable = null; current.onerror = null
      if (current.state !== 'inactive') current.stop()
    }
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
  }, [])

  const invalidate = useCallback(() => {
    generation.current++
    release(); active.current = false
  }, [release])

  const cancel = useCallback(() => {
    invalidate()
    setStatus('idle'); setFile(null); setElapsed(0); setError(null)
  }, [invalidate])

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') {
      setStatus('processing')
      recorder.current.stop()
      // Do not wait for the final dataavailable event to release the microphone.
      stream.current?.getTracks().forEach(track => track.stop())
      stream.current = null
      clearTimeout(limitTimer.current); clearInterval(progressTimer.current)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const hide = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', hide)
    return () => {
      mounted.current = false; invalidate()
      document.removeEventListener('visibilitychange', hide)
    }
  }, [invalidate, stop])

  const start = useCallback(async () => {
    if (active.current) return
    active.current = true
    const ticket = ++generation.current
    setError(null); setFile(null); setElapsed(0)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia
      || typeof MediaRecorder === 'undefined' || typeof OfflineAudioContext === 'undefined') {
      setError('이 환경에서는 녹음할 수 없습니다. HTTPS 또는 localhost에서 최신 브라우저를 사용해 주세요.')
      setStatus('idle'); active.current = false; return
    }
    setStatus('requesting')
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false })
      if (!mounted.current || ticket !== generation.current) { input.getTracks().forEach(track => track.stop()); return }
      if (document.hidden) {
        input.getTracks().forEach(track => track.stop()); active.current = false; setStatus('idle')
        setError('화면이 비활성화되어 녹음을 시작하지 않았습니다. 다시 녹음해 주세요.'); return
      }
      stream.current = input
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type))
      const current = new MediaRecorder(input, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined)
      recorder.current = current
      const chunks: Blob[] = []
      let bytes = 0
      const fail = (message: string) => {
        if (!mounted.current || ticket !== generation.current) return
        generation.current++; release(); active.current = false
        setStatus('idle'); setError(message)
      }
      current.ondataavailable = event => {
        if (ticket !== generation.current || !event.data.size) return
        bytes += event.data.size
        if (bytes > MAX_RECORDING_BYTES) { fail('녹음 용량이 너무 큽니다. 짧게 다시 녹음해 주세요.'); return }
        chunks.push(event.data)
      }
      current.onerror = () => fail('마이크 녹음이 중단되었습니다. 다시 녹음해 주세요.')
      current.onstop = async () => {
        if (!mounted.current || ticket !== generation.current) return
        release(); setStatus('processing')
        try {
          const audio = await normalizeRecordedAudio(new Blob(chunks, { type: current.mimeType }))
          if (!mounted.current || ticket !== generation.current) return
          setFile(audio); setStatus('ready')
        } catch {
          if (mounted.current && ticket === generation.current) {
            setStatus('idle'); setError('녹음을 읽을 수 없습니다. 다시 녹음해 주세요.')
          }
        } finally {
          if (ticket === generation.current) active.current = false
        }
      }
      current.start(250)
      setStatus('recording')
      const startedAt = Date.now()
      progressTimer.current = setInterval(() => setElapsed(Math.min(60, Math.floor((Date.now() - startedAt) / 1000))), 250)
      limitTimer.current = setTimeout(() => { setElapsed(60); stop() }, 60_000)
    } catch (reason) {
      if (!mounted.current || ticket !== generation.current) return
      release(); active.current = false; setStatus('idle')
      const name = reason instanceof DOMException ? reason.name : ''
      setError(name === 'NotAllowedError' ? '마이크 사용을 허용해 주세요. 브라우저의 사이트 권한에서 변경할 수 있습니다.'
        : name === 'NotFoundError' ? '사용 가능한 마이크를 찾지 못했습니다. 마이크를 연결해 주세요.'
          : '마이크를 시작하지 못했습니다. 다른 앱의 마이크 사용을 확인하고 다시 녹음해 주세요.')
    }
  }, [release, stop])

  return { status, elapsed, file, error, start, stop, cancel }
}
