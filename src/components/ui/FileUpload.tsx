import { useRef, useState, useEffect } from 'react'
import { UploadCloud, Trash2, Eye } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '../../lib/supabase'

type UploadState = 'idle' | 'uploading' | 'done'

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getExt(name: string): string {
  return name.split('.').pop()?.toUpperCase() ?? 'FILE'
}

function nameFromUrl(url: string): string {
  const last = decodeURIComponent(url.split('/').pop() ?? url)
  // Strip leading timestamp prefix: "1720000000000-filename.pdf" → "filename.pdf"
  return last.replace(/^\d{10,}-/, '')
}

function extBadgeColor(ext: string): string {
  const map: Record<string, string> = {
    PDF: 'bg-red-600',
    DOC: 'bg-blue-600',
    DOCX: 'bg-blue-600',
    PNG: 'bg-emerald-600',
    JPG: 'bg-emerald-600',
    JPEG: 'bg-emerald-600',
  }
  return map[ext] ?? 'bg-gray-500'
}

function FileIcon({ ext }: { ext: string }) {
  return (
    <div className="relative shrink-0 size-10">
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full" fill="none">
        <path
          d="M8 4h16l8 8v24a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
          fill="#f2f4f7" stroke="#e4e7ec" strokeWidth="1"
        />
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

interface FileUploadProps {
  label: string
  /** Path prefix inside the `vehicle-documents` bucket, e.g. "reg", "ins" */
  storagePath?: string
  /** URL of an already-uploaded file — shows in done state immediately */
  existingUrl?: string | null
  /** Disabled / view-only mode: shows existing file without delete or re-upload */
  disabled?: boolean
  /** Called with the new public URL after upload, or null when file is removed */
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

  const [state, setState] = useState<UploadState>(() => existingUrl ? 'done' : 'idle')
  // Local file picked by the user (null when showing an existing URL)
  const [localFile, setLocalFile] = useState<File | null>(null)
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null)
  // The public URL after a successful upload
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(existingUrl ?? null)
  const [displayName, setDisplayName] = useState<string>(() =>
    existingUrl ? nameFromUrl(existingUrl) : '',
  )
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // When the existingUrl prop changes (e.g. switching between rows), re-sync
  useEffect(() => {
    if (existingUrl) {
      setState('done')
      setUploadedUrl(existingUrl)
      setDisplayName(nameFromUrl(existingUrl))
    } else {
      setState('idle')
      setUploadedUrl(null)
      setDisplayName('')
    }
    setLocalFile(null)
    if (localObjectUrl) URL.revokeObjectURL(localObjectUrl)
    setLocalObjectUrl(null)
    setProgress(0)
    setError(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingUrl])

  useEffect(() => {
    return () => { if (localObjectUrl) URL.revokeObjectURL(localObjectUrl) }
  }, [localObjectUrl])

  async function handleFile(file: File) {
    setError(null)
    const objUrl = URL.createObjectURL(file)
    setLocalFile(file)
    setLocalObjectUrl(objUrl)
    setDisplayName(file.name)
    setState('uploading')
    setProgress(0)

    // Simulate progress while uploading
    let pct = 0
    const ticker = setInterval(() => {
      pct += Math.random() * 15 + 5
      if (pct >= 90) { pct = 90; clearInterval(ticker) }
      setProgress(Math.round(pct))
    }, 120)

    try {
      const filePath = `${storagePath}/${Date.now()}-${file.name}`
      const { data, error: uploadError } = await supabase.storage
        .from('vehicle-documents')
        .upload(filePath, file, { upsert: false })

      clearInterval(ticker)

      if (uploadError) {
        throw uploadError
      }

      const { data: { publicUrl } } = supabase.storage
        .from('vehicle-documents')
        .getPublicUrl(data.path)

      setProgress(100)
      setUploadedUrl(publicUrl)
      setState('done')
      onChange?.(publicUrl)
    } catch (err: any) {
      clearInterval(ticker)
      console.error('[FileUpload] upload failed:', err)
      setProgress(0)
      setState('idle')
      setLocalFile(null)
      if (localObjectUrl) URL.revokeObjectURL(localObjectUrl)
      setLocalObjectUrl(null)
      setError(err?.message ?? 'Upload failed')
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  function handleRemove() {
    setLocalFile(null)
    if (localObjectUrl) URL.revokeObjectURL(localObjectUrl)
    setLocalObjectUrl(null)
    setUploadedUrl(null)
    setDisplayName('')
    setProgress(0)
    setError(null)
    setState('idle')
    onChange?.(null)
  }

  function handleView() {
    const url = uploadedUrl ?? localObjectUrl
    if (url) window.open(url, '_blank')
  }

  const ext = getExt(displayName)
  const fileSize = localFile ? formatSize(localFile.size) : null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>

      {state === 'idle' && !disabled && (
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

      {(state === 'uploading' || state === 'done') && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3 items-start relative">
          <FileIcon ext={ext} />

          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <p className="text-sm font-medium text-gray-700 truncate">{displayName}</p>
            {fileSize && <p className="text-sm text-gray-500">{fileSize}</p>}

            {state === 'uploading' && (
              <div className="flex items-center gap-3 mt-1">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-600 rounded-full transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-gray-700 shrink-0 tabular-nums">
                  {progress}%
                </span>
              </div>
            )}

            {state === 'done' && (
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

          {/* Only show delete when not disabled and not mid-upload */}
          {!disabled && state !== 'uploading' && (
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

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

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
