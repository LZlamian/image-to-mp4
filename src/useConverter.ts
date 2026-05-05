import { useRef, useState, useCallback } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

export type ConvertMode = 'one-to-one' | 'many-to-one'

export interface ConversionResult {
  name: string
  url: string
}

const CDN = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'

export function useConverter() {
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const loadedRef = useRef(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [converting, setConverting] = useState(false)

  const load = useCallback(async () => {
    if (loadedRef.current) return
    setLoading(true)
    setStatus('Loading video engine (~31 MB, cached after first load)…')
    const ffmpeg = new FFmpeg()
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${CDN}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${CDN}/ffmpeg-core.wasm`, 'application/wasm'),
    ])
    await ffmpeg.load({ coreURL, wasmURL })
    ffmpegRef.current = ffmpeg
    loadedRef.current = true
    setLoaded(true)
    setLoading(false)
    setStatus('')
  }, [])

  const convert = useCallback(async (
    files: File[],
    mode: ConvertMode,
    duration: number,
  ): Promise<ConversionResult[]> => {
    const ffmpeg = ffmpegRef.current!
    setConverting(true)
    const results: ConversionResult[] = []

    try {
      if (mode === 'one-to-one') {
        for (let i = 0; i < files.length; i++) {
          setStatus(`Converting image ${i + 1} of ${files.length}…`)
          const normalized = await normalizeToJpeg(files[i])
          const inputName = `img${i}.jpg`
          const outputName = `out${i}.mp4`

          await ffmpeg.writeFile(inputName, await fetchFile(normalized))
          await ffmpeg.exec([
            '-loop', '1', '-i', inputName,
            '-t', String(duration),
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
            outputName,
          ])

          const data = await ffmpeg.readFile(outputName)
          results.push({
            name: stem(files[i].name) + '.mp4',
            url: URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: 'video/mp4' })),
          })
          await ffmpeg.deleteFile(inputName)
          await ffmpeg.deleteFile(outputName)
        }
      } else {
        setStatus('Building slideshow…')
        const normalized = await Promise.all(files.map(normalizeToJpeg))

        // Detect output dimensions from the first image
        const [outW, outH] = await getOutputDimensions(normalized[0])
        const vf = [
          `scale=${outW}:${outH}:force_original_aspect_ratio=decrease`,
          `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:black`,
        ].join(',')

        const lines: string[] = []
        for (let i = 0; i < normalized.length; i++) {
          const name = `img${i}.jpg`
          await ffmpeg.writeFile(name, await fetchFile(normalized[i]))
          lines.push(`file '${name}'`, `duration ${duration}`)
        }
        // Concat demuxer requires the last file repeated without a duration
        lines.push(`file 'img${normalized.length - 1}.jpg'`)
        await ffmpeg.writeFile('list.txt', lines.join('\n'))

        await ffmpeg.exec([
          '-f', 'concat', '-safe', '0', '-i', 'list.txt',
          '-vf', vf,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast',
          'out.mp4',
        ])

        const data = await ffmpeg.readFile('out.mp4')
        results.push({
          name: 'slideshow.mp4',
          url: URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: 'video/mp4' })),
        })

        for (let i = 0; i < normalized.length; i++) await ffmpeg.deleteFile(`img${i}.jpg`)
        await ffmpeg.deleteFile('list.txt')
        await ffmpeg.deleteFile('out.mp4')
      }
    } finally {
      setConverting(false)
      setStatus('')
    }

    return results
  }, [])

  return { load, loaded, loading, status, converting, convert }
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

async function getOutputDimensions(file: File): Promise<[number, number]> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      // Ensure even dimensions (H.264 requirement)
      const w = Math.ceil(img.naturalWidth / 2) * 2
      const h = Math.ceil(img.naturalHeight / 2) * 2
      URL.revokeObjectURL(url)
      resolve([w, h])
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve([1920, 1080]) }
    img.src = url
  })
}

function stem(filename: string): string {
  return filename.replace(/\.[^.]+$/, '')
}
