import { useState, useCallback } from 'react'
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'

export type ConvertMode = 'one-to-one' | 'many-to-one'

export interface ConversionResult {
  name: string
  url: string
}

const MAX_SIDE = 1920 // cap longest dimension to 1080p-equivalent

export function useConverter() {
  const [status, setStatus] = useState('')
  const [converting, setConverting] = useState(false)

  // No async loading needed — Web Codecs are built-in
  const load = useCallback(async () => {}, [])

  const convert = useCallback(async (
    files: File[],
    mode: ConvertMode,
    duration: number,
  ): Promise<ConversionResult[]> => {
    if (!('VideoEncoder' in window)) {
      throw new Error(
        'Video encoding is not supported in this browser. Please use Chrome, Edge, or Safari 16.4+.',
      )
    }

    setConverting(true)
    const results: ConversionResult[] = []

    try {
      if (mode === 'one-to-one') {
        for (let i = 0; i < files.length; i++) {
          setStatus(`Converting image ${i + 1} of ${files.length}…`)
          const normalized = await normalizeToJpeg(files[i])
          const blob = await encodeSlideshow([normalized], duration)
          results.push({
            name: stem(files[i].name) + '.mp4',
            url: URL.createObjectURL(blob),
          })
        }
      } else {
        setStatus('Building slideshow…')
        const normalized = await Promise.all(files.map(normalizeToJpeg))
        const blob = await encodeSlideshow(normalized, duration, (i) => {
          setStatus(`Encoding image ${i + 1} of ${normalized.length}…`)
        })
        results.push({ name: 'slideshow.mp4', url: URL.createObjectURL(blob) })
      }
    } finally {
      setConverting(false)
      setStatus('')
    }

    return results
  }, [])

  return { load, loaded: true, loading: false, status, converting, convert }
}

async function encodeSlideshow(
  files: File[],
  duration: number,
  onProgress?: (imageIndex: number) => void,
): Promise<Blob> {
  const images = await Promise.all(files.map(loadImage))

  // Determine output size, capped at MAX_SIDE, even dimensions required by H.264
  const rawW = Math.max(...images.map(img => img.naturalWidth))
  const rawH = Math.max(...images.map(img => img.naturalHeight))
  const scale = Math.min(1, MAX_SIDE / Math.max(rawW, rawH))
  const w = Math.ceil(rawW * scale / 2) * 2
  const h = Math.ceil(rawH * scale / 2) * 2

  // Prefer Main Profile; fall back to Baseline
  let codecConfig: VideoEncoderConfig = {
    codec: 'avc1.4D0028', // H.264 Main Profile Level 4.0
    width: w,
    height: h,
    framerate: 30,
    bitrate: 2_000_000,
  }
  const check = await VideoEncoder.isConfigSupported(codecConfig)
  if (!check.supported) {
    codecConfig = { ...codecConfig, codec: 'avc1.42001F' } // Baseline Level 3.1
    const fallback = await VideoEncoder.isConfigSupported(codecConfig)
    if (!fallback.supported) {
      throw new Error('H.264 encoding is not supported on this device.')
    }
  }

  const fps = 30
  const frameDuration = Math.round(1_000_000 / fps) // microseconds per frame

  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: w, height: h },
    fastStart: 'in-memory',
  })

  let encoderError: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      // chunk.duration is often null from VideoEncoder; addVideoChunkRaw requires
      // a non-negative number, so we always supply the explicit frame duration.
      const buf = new Uint8Array(chunk.byteLength)
      chunk.copyTo(buf)
      muxer.addVideoChunkRaw(buf, chunk.type, chunk.timestamp, chunk.duration ?? frameDuration, meta ?? undefined)
    },
    error: (e) => { encoderError = e },
  })
  encoder.configure(codecConfig)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  let timestamp = 0

  for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
    onProgress?.(imgIdx)
    if (encoderError) throw encoderError

    const img = images[imgIdx]
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, w, h)
    const s = Math.min(w / img.naturalWidth, h / img.naturalHeight)
    const iw = Math.round(img.naturalWidth * s)
    const ih = Math.round(img.naturalHeight * s)
    ctx.drawImage(img, Math.round((w - iw) / 2), Math.round((h - ih) / 2), iw, ih)

    const frameCount = Math.round(duration * fps)
    for (let f = 0; f < frameCount; f++) {
      if (encoderError) throw encoderError
      // Apply backpressure if encoder is saturated
      while (encoder.encodeQueueSize > 30) {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      const frame = new VideoFrame(canvas, { timestamp })
      encoder.encode(frame, { keyFrame: f === 0 })
      frame.close()
      timestamp += frameDuration
    }
  }

  await encoder.flush()
  if (encoderError) throw encoderError
  muxer.finalize()

  return new Blob([target.buffer], { type: 'video/mp4' })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Failed to load: ${file.name}`)) }
    img.src = url
  })
}

async function normalizeToJpeg(file: File): Promise<File> {
  const name = file.name.toLowerCase()
  if (
    file.type === 'image/heic' || file.type === 'image/heif' ||
    name.endsWith('.heic') || name.endsWith('.heif')
  ) {
    const heic2any = (await import('heic2any')).default
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 }) as Blob
    return new File([blob], stem(file.name) + '.jpg', { type: 'image/jpeg' })
  }
  return file
}

function stem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '')
}
