import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useConverter, ConvertMode, ConversionResult } from './useConverter'
import './index.css'

const ACCEPT = 'image/*,.heic,.heif'

export default function App() {
  const [files, setFiles] = useState<File[]>([])
  const [mode, setMode] = useState<ConvertMode>('many-to-one')
  const [duration, setDuration] = useState(5)
  const [results, setResults] = useState<ConversionResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { load, loaded, loading, status, converting, convert } = useConverter()

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const valid = Array.from(incoming).filter(f => {
      const n = f.name.toLowerCase()
      return f.type.startsWith('image/') || n.endsWith('.heic') || n.endsWith('.heif')
    })
    if (!valid.length) return
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...valid.filter(f => !names.has(f.name))]
    })
    setResults([])
    setError(null)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }, [addFiles])

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files)
      e.target.value = ''
    }
  }, [addFiles])

  const removeFile = useCallback((idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
    setResults([])
  }, [])

  const clearAll = useCallback(() => {
    setFiles([])
    setResults([])
    setError(null)
  }, [])

  const handleConvert = async () => {
    setError(null)
    setResults([])
    try {
      if (!loaded) await load()
      const res = await convert(files, mode, duration)
      setResults(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed. Please try again.')
    }
  }

  const isWorking = loading || converting

  return (
    <div className="app">
      <header>
        <h1>🎞️ Image → MP4</h1>
        <p className="subtitle">Convert images to video in your browser — no uploads, no accounts</p>
      </header>

      <main>
        <div
          className={`drop-zone${isDragging ? ' dragging' : ''}`}
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
          aria-label="Select images"
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={onInputChange}
            style={{ display: 'none' }}
          />
          <div className="drop-content">
            <span className="drop-icon">{isDragging ? '📂' : '📁'}</span>
            <span className="drop-label">
              {files.length > 0 ? 'Add more images' : 'Drop images here or tap to select'}
            </span>
            <span className="drop-hint">JPEG · PNG · WebP · HEIC · GIF</span>
          </div>
        </div>

        {files.length > 0 && (
          <section className="image-section">
            <div className="section-header">
              <h2>{files.length} image{files.length !== 1 ? 's' : ''} selected</h2>
              <button className="clear-btn" onClick={clearAll} disabled={isWorking}>
                Clear all
              </button>
            </div>
            <ul className="image-list">
              {files.map((file, i) => (
                <li key={`${file.name}-${i}`} className="image-item">
                  <ImageThumb file={file} />
                  <span className="filename" title={file.name}>{file.name}</span>
                  <button
                    className="remove-btn"
                    onClick={() => removeFile(i)}
                    disabled={isWorking}
                    aria-label={`Remove ${file.name}`}
                  >✕</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {files.length > 0 && (
          <section className="controls">
            <div className="control-group">
              <span className="control-label">Output mode</span>
              <div className="toggle-group" role="group">
                <button
                  className={`toggle-btn${mode === 'many-to-one' ? ' active' : ''}`}
                  onClick={() => setMode('many-to-one')}
                  disabled={isWorking}
                >All → 1 video</button>
                <button
                  className={`toggle-btn${mode === 'one-to-one' ? ' active' : ''}`}
                  onClick={() => setMode('one-to-one')}
                  disabled={isWorking}
                >1 video each</button>
              </div>
            </div>

            <div className="control-group">
              <label className="control-label" htmlFor="dur">
                Duration per image: <strong>{duration}s</strong>
              </label>
              <input
                id="dur"
                type="range"
                min={3}
                max={10}
                step={1}
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                disabled={isWorking}
                className="slider"
              />
              <div className="slider-labels"><span>3s</span><span>10s</span></div>
            </div>

            <button
              className="convert-btn"
              onClick={handleConvert}
              disabled={isWorking}
            >
              {isWorking
                ? <><span className="spinner" aria-hidden="true" /> {status || 'Working…'}</>
                : '🎬 Convert to MP4'}
            </button>

            {error && <div className="error-box" role="alert"><strong>Error: </strong>{error}</div>}
          </section>
        )}

        {results.length > 0 && (
          <section className="results">
            <h2>✅ {results.length === 1 ? 'Your video is ready' : `${results.length} videos ready`}</h2>
            {results.map((r, i) => (
              <div key={i} className="result-card">
                <video src={r.url} controls playsInline className="result-video" />
                <a href={r.url} download={r.name} className="download-btn">
                  ⬇️ Download {r.name}
                </a>
              </div>
            ))}
          </section>
        )}

        {files.length === 0 && (
          <p className="empty-hint">Your images never leave your device — everything runs locally in your browser.</p>
        )}
      </main>

      <footer>
        <p>Powered by <a href="https://github.com/ffmpegwasm/ffmpeg.wasm" target="_blank" rel="noopener noreferrer">ffmpeg.wasm</a></p>
      </footer>
    </div>
  )
}

function ImageThumb({ file }: { file: File }) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (!src || failed) {
    return <div className="thumb thumb-placeholder" aria-hidden="true">🖼️</div>
  }
  return (
    <img
      src={src}
      alt=""
      className="thumb"
      onError={() => setFailed(true)}
      loading="lazy"
    />
  )
}
