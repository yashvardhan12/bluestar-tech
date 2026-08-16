import { useEffect, useRef, useState } from 'react'

/**
 * Finger signature capture on a canvas. FR-27.
 *
 * Pointer events rather than a library: touch, pen and mouse arrive through
 * one API, and pointer capture keeps a stroke alive when the finger leaves the
 * canvas mid-swipe. That is the whole reason a signature library exists.
 *
 * The passenger is handed the phone for this and gets no explanation, so the
 * only affordances are a line to sign above and a Clear button.
 */
export default function SignaturePad({ onChange }: { onChange: (blob: Blob | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  // Backing store at device resolution, or the line looks like a fax.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#101828'
  }, [])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    drawing.current = true
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!hasInk) setHasInk(true)
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    canvasRef.current!.toBlob(b => onChange(b), 'image/png')
  }

  function clear() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative rounded-xl border border-gray-300 bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          // Without this the browser scrolls the page instead of drawing.
          className="block w-full h-44 touch-none"
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-sm text-gray-400">
            Sign above the line
          </span>
        )}
        <div className="pointer-events-none absolute inset-x-8 bottom-7 border-b border-gray-200" />
      </div>

      <button
        type="button"
        onClick={clear}
        disabled={!hasInk}
        className="self-end text-sm font-medium text-violet-700 disabled:text-gray-400 cursor-pointer"
      >
        Clear
      </button>
    </div>
  )
}
