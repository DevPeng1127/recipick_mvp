import { expect, it } from 'vitest'
import { encodeVoiceWav } from '../utils/voiceAudio'

it('encodes a bounded mono PCM WAV with clipped samples', () => {
  const wav = encodeVoiceWav(new Float32Array([-2, -0.5, 0, 0.5, 2]))
  const data = new DataView(wav)
  expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF')
  expect(data.getUint16(22, true)).toBe(1)
  expect(data.getUint32(24, true)).toBe(16000)
  expect(data.getUint16(34, true)).toBe(16)
  expect(data.getUint32(40, true)).toBe(10)
  expect(data.getInt16(44, true)).toBe(-32768)
  expect(data.getInt16(52, true)).toBe(32767)
})

it('caps delayed recorder output at exactly sixty seconds', () => {
  const wav = encodeVoiceWav(new Float32Array(16000 * 61))
  expect(wav.byteLength).toBe(44 + 16000 * 60 * 2)
  expect(new DataView(wav).getUint32(40, true)).toBe(16000 * 60 * 2)
})
