import { useRef, useCallback, useState } from 'react'

interface UseAudioOptions {
  onAudioData: (base64: string) => void
  onVolumeChange: (volume: number) => void
}

export function useAudio({ onAudioData, onVolumeChange }: UseAudioOptions) {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
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
          sampleRate: 16000,
          channelCount: 1,
        },
      })
      streamRef.current = stream
      console.log('[Audio] Got media stream')

      // Create AudioContext at 16kHz for Gemini
      const audioCtx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = audioCtx
      
      // Resume context (required for some browsers)
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume()
      }

      const source = audioCtx.createMediaStreamSource(stream)

      // Volume analyser for visual feedback
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const trackVolume = () => {
        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        onVolumeChange(avg / 128)
        animFrameRef.current = requestAnimationFrame(trackVolume)
      }
      trackVolume()

      // Use ScriptProcessorNode for PCM extraction (AudioWorklet requires separate file)
      // ScriptProcessorNode is deprecated but works everywhere
      const bufferSize = 4096
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1)
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        
        // Convert Float32 (-1 to 1) to Int16 PCM
        const pcm16 = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }
        
        // Convert to base64
        const bytes = new Uint8Array(pcm16.buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = btoa(binary)
        onAudioData(base64)
      }

      source.connect(processor)
      processor.connect(audioCtx.destination) // Required for processing to work
      
      workletNodeRef.current = processor as unknown as AudioWorkletNode

      setIsRecording(true)
      console.log('[Audio] Recording started - sending PCM chunks')
    } catch (err) {
      console.error('[Audio] Failed to start recording:', err)
    }
  }, [onAudioData, onVolumeChange])

  const stopRecording = useCallback(() => {
    console.log('[Audio] Stopping recording...')
    cancelAnimationFrame(animFrameRef.current)
    onVolumeChange(0)

    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }
    
    if (audioCtxRef.current) {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setIsRecording(false)
    console.log('[Audio] Recording stopped')
  }, [onVolumeChange])

  return { isRecording, startRecording, stopRecording }
}

// ─── Playback queue for synchronized audio ──────────────────────────────────

interface AudioQueueItem {
  base64: string
  sequence: number
}

export class AudioPlaybackQueue {
  private queue: AudioQueueItem[] = []
  private isPlaying = false
  private audioCtx: AudioContext | null = null
  public onPlaybackVolume: ((v: number) => void) | null = null

  private getCtx(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      // Gemini outputs 24kHz audio
      this.audioCtx = new AudioContext({ sampleRate: 24000 })
    }
    return this.audioCtx
  }

  // Call on first user gesture to unlock AudioContext (browser autoplay policy)
  unlock() {
    const ctx = this.getCtx()
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => console.log('[AudioQueue] AudioContext unlocked'))
    }
  }

  enqueue(base64: string, sequence: number) {
    console.log(`[AudioQueue] Enqueue seq=${sequence}, size=${base64.length}`)
    this.queue.push({ base64, sequence })
    this.queue.sort((a, b) => a.sequence - b.sequence)
    if (!this.isPlaying) this.playNext()
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false
      this.onPlaybackVolume?.(0)
      return
    }
    this.isPlaying = true
    const item = this.queue.shift()!
    console.log(`[AudioQueue] Playing seq=${item.sequence}`)

    try {
      const ctx = this.getCtx()
      
      // Resume context if suspended (required for autoplay policy)
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      // Decode base64 to raw bytes
      const binary = atob(item.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }

      // Convert Int16 PCM to Float32 for Web Audio API
      const int16 = new Int16Array(bytes.buffer)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0
      }

      // Create AudioBuffer manually for raw PCM
      const audioBuffer = ctx.createBuffer(1, float32.length, 24000)
      audioBuffer.getChannelData(0).set(float32)

      const source = ctx.createBufferSource()
      source.buffer = audioBuffer

      // Volume analyser for Sprout breathing animation
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyser.connect(ctx.destination)

      const data = new Uint8Array(analyser.frequencyBinCount)
      const trackVol = () => {
        if (!this.isPlaying) return
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        this.onPlaybackVolume?.(avg / 128)
        requestAnimationFrame(trackVol)
      }
      trackVol()

      source.onended = () => {
        console.log(`[AudioQueue] Finished seq=${item.sequence}`)
        this.playNext()
      }
      source.start()
    } catch (e) {
      console.error('[AudioQueue] Playback error:', e)
      this.playNext()
    }
  }

  clear() {
    console.log('[AudioQueue] Clearing queue')
    this.queue = []
    this.isPlaying = false
    this.onPlaybackVolume?.(0)
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close()
    }
    this.audioCtx = null
  }
}
