import { useRef, useCallback, useState } from 'react'

interface UseAudioOptions {
  onAudioData: (base64: string) => void
  onVolumeChange: (volume: number) => void
}

export function useAudio({ onAudioData, onVolumeChange }: UseAudioOptions) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)
  const [isRecording, setIsRecording] = useState(false)

  const startRecording = useCallback(async () => {
    try {
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

      // Volume analyser
      const audioCtx = new AudioContext({ sampleRate: 16000 })
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const trackVolume = () => {
        analyser.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        onVolumeChange(avg / 128) // normalize 0-1
        animFrameRef.current = requestAnimationFrame(trackVolume)
      }
      trackVolume()

      // MediaRecorder for PCM-like chunks
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = async (e) => {
        if (e.data.size === 0) return
        const buffer = await e.data.arrayBuffer()
        const base64 = btoa(
          String.fromCharCode(...new Uint8Array(buffer))
        )
        onAudioData(base64)
      }

      recorder.start(250) // send chunks every 250ms
      setIsRecording(true)
    } catch (err) {
      console.error('[Audio] Failed to start recording:', err)
    }
  }, [onAudioData, onVolumeChange])

  const stopRecording = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current)
    onVolumeChange(0)

    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setIsRecording(false)
  }, [onVolumeChange])

  return { isRecording, startRecording, stopRecording }
}

// ─── Playback queue for synchronized audio + text ───────────────────────────

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
      this.audioCtx = new AudioContext({ sampleRate: 24000 })
    }
    return this.audioCtx
  }

  enqueue(base64: string, sequence: number) {
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

    try {
      const ctx = this.getCtx()
      const binary = atob(item.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer)
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

      source.onended = () => this.playNext()
      source.start()
    } catch (e) {
      console.error('[AudioQueue] Playback error:', e)
      this.playNext()
    }
  }

  clear() {
    this.queue = []
    this.isPlaying = false
    this.audioCtx?.close()
    this.audioCtx = null
  }
}
