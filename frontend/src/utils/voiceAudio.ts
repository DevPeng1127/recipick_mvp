const SAMPLE_RATE = 16000
const MAX_SECONDS = 60

export function encodeVoiceWav(samples: Float32Array): ArrayBuffer {
  const length = Math.min(samples.length, SAMPLE_RATE * MAX_SECONDS)
  const buffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); text(8, 'WAVE')
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, length * 2, true)
  for (let i = 0; i < length; i++) {
    const sample = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true)
  }
  return buffer
}

export async function normalizeRecordedAudio(blob: Blob): Promise<File> {
  // Decode/resample locally: the server accepts one bounded PCM format only.
  const decoder = new OfflineAudioContext(1, 1, SAMPLE_RATE)
  const decoded = await decoder.decodeAudioData(await blob.arrayBuffer())
  const frames = Math.min(decoded.length, SAMPLE_RATE * MAX_SECONDS)
  if (!frames) throw new Error('Empty recording')
  const context = new OfflineAudioContext(1, frames, SAMPLE_RATE)
  const source = context.createBufferSource()
  source.buffer = decoded
  source.connect(context.destination)
  source.start()
  const audio = await context.startRendering()
  return new File([encodeVoiceWav(audio.getChannelData(0))], 'voice.wav', { type: 'audio/wav' })
}
