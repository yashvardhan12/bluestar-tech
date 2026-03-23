import { useRef, useState, useEffect } from 'react'
import { UploadCloud, Trash2, Eye } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'

// ── helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getExt(name: string): string {
  return name.split('.').pop()?.toUpperCase() ?? 'FILE'
}

function nameFromUrl(url: string): string {
  const last = decodeURIComponent(url.split('/').pop() ?? url)
  return last.replace(/^\d{10,}-/, '')   // strip "1720000000000-" timestamp prefix
}

function extBadgeColor(ext: string): string {
  const map: Record<string, string> = {
    PDF: 'bg-red-600', DOC: 'bg-blue-600', DOCX: 'bg-blue-600',
    PNG: 'bg-emerald-600', JPG: 'bg-emerald-600', JPEG: 'bg-emerald-600',
  }
  return map[ext] ?? 'bg-gray-500'
}

function FileIcon({ ext }: { ext: string }) {
  return (
    <div className="relative shrink-0 size-10">
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full" fill="none">
        <path d="M8 4h16l8 8v24a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
          fill="#f2f4f7" stroke="#e4e7ec" strokeWidth="1" />
        <path d="M24 4v8h8" fill="#e4e7ec" />
      </svg>
      <span className={clsx(
        'absolute bottom-1.5 left-1 px-[3px] py-px rounded-[2px] text-white font-bold leading-none text-[8px]',
        extBadgeColor(ext),
      )}>
        {ext.length > 4 ? ext.slice(0, 4) : ext}
      </span>
    </div>
  )
}

// ── state ────────────────────────────────────────────────────────────────────

type FileState =
  | { kind: 'idle' }
  | { kind: 'uploading'; file: File; objectUrl: string; progress: number }
  | { kind: 'done'; url: string; name: string }

function initialState(existingUrl?: string | null): FileState {
  return existingUrl
    ? { kind: 'done', url: existingUrl, name: nameFromUrl(existingUrl) }
    : { kind: 'idle' }
}

// ── component ─────────────────────────────────────────────────────────────────

interface FileUploadProps {
  label: string
  storagePath?: string
  existingUrl?: string | null
  disabled?: boolean
  onChange?: (url: string | null) => void
}

export default function FileUpload({
  label,
  storagePath = 'misc',
  existingUrl,
  disabled = false,
  onChange,
}: FileUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileState, setFileState] = useState<FileState>(() => initialState(existingUrl))
  const [error, setError] = useState<string | null>(null)

  // Sync when existingUrl changes (e.g. switching between table rows).
  // Never interrupt an in-progress upload.
  useEffect(() => {
    setFileState(prev => {
      if (prev.kind === 'uploading') return prev
      return initialState(existingUrl)
    })
  }, [existingUrl])

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      if (fileState.kind === 'uploading') URL.revokeObjectURL(fileState.objectUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleFile(file: File) {
    setError(null)
    const objectUrl = URL.createObjectURL(file)

    setFileState({ kind: 'uploading', file, objectUrl, progress: 0 })

    // Simulate progress up to 90% while real upload runs
    const ticker = setInterval(() => {
      setFileState(prev => {
        if (prev.kind !== 'uploading') { clearInterval(ticker); return prev }
        const next = Math.min(prev.progress + Math.random() * 15 + 5, 90)
        return { ...prev, progress: Math.round(next) }
      })
    }, 120)

    try {
      const filePath = `${storagePath}/${Date.now()}-${file.name}`
      const { data, error: uploadErr } = await supabase.storage
        .from('vehicle-documents')
        .upload(filePath, file, { upsert: false })

      clearInterval(ticker)

      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabase.storage
        .from('vehicle-documents')
        .getPublicUrl(data.path)

      URL.revokeObjectURL(objectUrl)
      setFileState({ kind: 'done', url: publicUrl, name: file.name })
      onChange?.(publicUrl)
    } catch (err: any) {
      clearInterval(ticker)
      URL.revokeObjectURL(objectUrl)
      console.error('[FileUpload] upload failed:', err)
      setError(err?.message ?? 'Upload failed. Please try again.')
      setFileState({ kind: 'idle' })
    }
  }

  function handleRemove() {
    if (fileState.kind === 'uploading') URL.revokeObjectURL(fileState.objectUrl)
    setFileState({ kind: 'idle' })
    setError(null)
    onChange?.(null)
  }

  function handleView() {
    const url = fileState.kind === 'done' ? fileState.url
      : fileState.kind === 'uploading' ? fileState.objectUrl
      : null
    if (url) window.open(url, '_blank')
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (disabled) return
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const displayName = fileState.kind === 'idle' ? '' : fileState.kind === 'uploading' ? fileState.file.name : fileState.name
  const ext = getExt(displayName)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>

      {/* Drop zone — only when idle and not disabled */}
      {fileState.kind === 'idle' && !disabled && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="bg-white border border-gray-200 rounded-xl py-4 px-6 flex flex-col items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
        >
          <div className="size-10 border border-gray-200 rounded-lg flex items-center justify-center shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)]">
            <UploadCloud className="size-5 text-gray-400" strokeWidth={1.75} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1 text-sm">
              <span className="font-semibold text-violet-700">Click to upload</span>
              <span className="text-gray-500 font-normal">or drag and drop</span>
            </div>
            <p className="text-xs text-gray-500">JPG, PNG, DOC or PDF (max. 10MB)</p>
          </div>
        </div>
      )}

      {/* File card — uploading or done */}
      {fileState.kind !== 'idle' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3 items-start">
          <FileIcon ext={ext} />

          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <p className="text-sm font-medium text-gray-700 truncate">{displayName}</p>
            {fileState.kind === 'uploading' && (
              <p className="text-sm text-gray-500">{formatSize(fileState.file.size)}</p>
            )}

            {fileState.kind === 'uploading' && (
              <div className="flex items-center gap-3 mt-1">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-600 rounded-full transition-all duration-150"
                    style={{ width: `${fileState.progress}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700 shrink-0 tabular-nums">
                  {fileState.progress}%
                </span>
              </div>
            )}

            {fileState.kind === 'done' && (
              <button
                type="button"
                onClick={handleView}
                className="flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:text-violet-900 transition-colors mt-0.5 w-fit"
              >
                <Eye className="size-4" strokeWidth={1.75} />
                View document
              </button>
            )}
          </div>

          {/* Delete button — hidden in disabled (view) mode and during upload */}
          {!disabled && fileState.kind !== 'uploading' && (
            <button
              type="button"
              onClick={handleRemove}
              className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
            >
              <Trash2 className="size-5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.doc,.docx,.pdf"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  )
}
