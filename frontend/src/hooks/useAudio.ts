import { useRef, useCallback, useState } from 'react'

interface UseAudioOptions {
  onAudioData: (base64: string) => void
  onVolumeChange: (volume: number) => void
}

export function useAudio({ onAudioData, onVolumeChange }: UseAudioOptions) {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animFrameRef = useRef<number>(0)
  const [isRecording, setIsRecording] = useState(false)

  const startRecording = useCallback(async () => {
    try {
      console.log('[Audio] Starting recording...')

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      })
      streamRef.current = stream

      const audioCtx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = audioCtx
      if (audioCtx.state === 'suspended') await audioCtx.resume()

      const source = audioCtx.createMediaStreamSource(stream)

      // Volume analyser
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const trackVolume = () => {
        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        onVolumeChange(avg / 128)
        animFrameRef.current = requestAnimationFrame(trackVolume)
      }
      trackVolume()

      // ScriptProcessorNode for PCM extraction
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        const pcm16 = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        const bytes = new Uint8Array(pcm16.buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
        onAudioData(btoa(binary))
      }

      source.connect(processor)
      // Connect to a silent gain node (NOT destination) to avoid feedback & DOM artifacts
      const silentGain = audioCtx.createGain()
      silentGain.gain.value = 0
      processor.connect(silentGain)
      silentGain.connect(audioCtx.destination)

      processorRef.current = processor
      setIsRecording(true)
      console.log('[Audio] Recording started (PCM 16kHz)')
    } catch (err) {
      console.error('[Audio] Failed to start recording:', err)
    }
  }, [onAudioData, onVolumeChange])

  const stopRecording = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current)
    onVolumeChange(0)
    processorRef.current?.disconnect()
    processorRef.current = null
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setIsRecording(false)
    console.log('[Audio] Recording stopped')
  }, [onVolumeChange])

  return { isRecording, startRecording, stopRecording }
}

// ─── Streaming PCM Playback Queue ────────────────────────────────────────────
// Gemini sends 24kHz Int16 PCM chunks. We schedule them back-to-back on a
// single AudioContext timeline so there are NO gaps between chunks.

export class AudioPlaybackQueue {
  private audioCtx: AudioContext | null = null
  private nextStartTime = 0          // when the next chunk should start
  private isActive = false
  private analyser: AnalyserNode | null = null
  private animFrame = 0
  public onPlaybackVolume: ((v: number) => void) | null = null

  private getCtx(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContext({ sampleRate: 24000 })
      this.nextStartTime = 0
      this.setupAnalyser()
    }
    return this.audioCtx
  }

  private setupAnalyser() {
    if (!this.audioCtx) return
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 256
    this.analyser.connect(this.audioCtx.destination)
    this.trackVolume()
  }

  private trackVolume() {
    if (!this.analyser || !this.isActive) return
    const data = new Uint8Array(this.analyser.frequencyBinCount)
    const tick = () => {
      if (!this.isActive || !this.analyser) return
      this.analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length
      this.onPlaybackVolume?.(avg / 128)
      this.animFrame = requestAnimationFrame(tick)
    }
    tick()
  }

  // Unlock AudioContext on first user gesture
  unlock() {
    const ctx = this.getCtx()
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => console.log('[AudioQueue] Unlocked'))
    }
  }

  enqueue(base64: string, sequence: number) {
    console.log(`[AudioQueue] enqueue seq=${sequence} len=${base64.length}`)
    const ctx = this.getCtx()

    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    // Decode base64 → Int16 PCM → Float32
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const int16 = new Int16Array(bytes.buffer)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0

    // Create AudioBuffer
    const buffer = ctx.createBuffer(1, float32.length, 24000)
    buffer.getChannelData(0).set(float32)

    const source = ctx.createBufferSource()
    source.buffer = buffer

    // Connect through analyser for volume tracking
    if (this.analyser) {
      source.connect(this.analyser)
    } else {
      source.connect(ctx.destination)
    }

    // Schedule seamlessly after previous chunk
    const now = ctx.currentTime
    const startAt = Math.max(now, this.nextStartTime)
    source.start(startAt)
    this.nextStartTime = startAt + buffer.duration

    this.isActive = true
    if (!this.analyser) this.setupAnalyser()

    // Detect when all audio finishes
    source.onended = () => {
      const remaining = this.nextStartTime - ctx.currentTime
      if (remaining <= 0.05) {
        // Queue is empty
        this.isActive = false
        this.onPlaybackVolume?.(0)
      }
    }

    console.log(`[AudioQueue] scheduled at ${startAt.toFixed(3)}, duration=${buffer.duration.toFixed(3)}s`)
  }

  clear() {
    console.log('[AudioQueue] clear')
    cancelAnimationFrame(this.animFrame)
    this.isActive = false
    this.onPlaybackVolume?.(0)
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close()
    }
    this.audioCtx = null
    this.analyser = null
    this.nextStartTime = 0
  }
}
