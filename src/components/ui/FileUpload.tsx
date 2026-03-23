import { useRef, useState, useEffect } from 'react'
import { UploadCloud, Trash2, Eye } from 'lucide-react'
import { clsx } from 'clsx'

type UploadState = 'idle' | 'uploading' | 'done'

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getExt(name: string): string {
  return name.split('.').pop()?.toUpperCase() ?? 'FILE'
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

// Simple SVG page icon
function FileIcon({ ext }: { ext: string }) {
  return (
    <div className="relative shrink-0 size-10">
      {/* Page shape */}
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full" fill="none">
        <path
          d="M8 4h16l8 8v24a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
          fill="#f2f4f7"
          stroke="#e4e7ec"
          strokeWidth="1"
        />
        <path d="M24 4v8h8" fill="#e4e7ec" />
      </svg>
      {/* Extension badge */}
      <span className={clsx(
        'absolute bottom-1.5 left-1 px-[3px] py-px rounded-[2px] text-white font-bold leading-none',
        'text-[8px]',
        extBadgeColor(ext),
      )}>
        {ext.length > 4 ? ext.slice(0, 4) : ext}
      </span>
    </div>
  )
}

interface FileUploadProps {
  label: string
}

export default function FileUpload({ label }: FileUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  // Simulate upload progress
  useEffect(() => {
    if (state !== 'uploading') return
    setProgress(0)
    let pct = 0
    const id = setInterval(() => {
      pct += Math.random() * 18 + 7          // random increment 7–25%
      if (pct >= 100) {
        pct = 100
        clearInterval(id)
        setState('done')
      }
      setProgress(Math.min(Math.round(pct), 100))
    }, 150)
    return () => clearInterval(id)
  }, [state])

  // Revoke object URL on unmount / file change
  useEffect(() => {
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [objectUrl])

  function handleFile(f: File) {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    const url = URL.createObjectURL(f)
    setFile(f)
    setObjectUrl(url)
    setState('uploading')
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
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    setFile(null)
    setObjectUrl(null)
    setProgress(0)
    setState('idle')
  }

  function handleView() {
    if (objectUrl) window.open(objectUrl, '_blank')
  }

  const ext = file ? getExt(file.name) : ''

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>

      {state === 'idle' ? (
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
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex gap-3 items-start relative">
          {/* File type icon */}
          <FileIcon ext={ext} />

          {/* Name, size, progress */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <p className="text-sm font-medium text-gray-700 truncate">{file!.name}</p>
            <p className="text-sm text-gray-500">{formatSize(file!.size)}</p>

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

          {/* Remove button */}
          <button
            type="button"
            onClick={handleRemove}
            className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
          >
            <Trash2 className="size-5" strokeWidth={1.75} />
          </button>
        </div>
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
