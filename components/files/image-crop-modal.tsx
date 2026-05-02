"use client"

import { Button } from "@/components/ui/button"
import { Check, RotateCcw, SkipForward } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

type Rect = { x: number; y: number; w: number; h: number }
type Handle = "tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l" | "move"

interface Props {
  file: File
  index: number
  total: number
  onConfirm: (file: File) => void
  onSkip: () => void
}

function detectBounds(img: HTMLImageElement): Rect {
  const SAMPLE = 400
  const ratio = Math.min(1, SAMPLE / img.naturalWidth, SAMPLE / img.naturalHeight)
  const sw = Math.round(img.naturalWidth * ratio)
  const sh = Math.round(img.naturalHeight * ratio)
  const c = document.createElement("canvas")
  c.width = sw
  c.height = sh
  const ctx = c.getContext("2d")!
  ctx.drawImage(img, 0, 0, sw, sh)
  const { data } = ctx.getImageData(0, 0, sw, sh)

  const luma = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]

  // Sample border pixels to estimate background brightness
  let sum = 0
  let n = 0
  for (let x = 0; x < sw; x++) {
    sum += luma(x * 4)
    sum += luma(((sh - 1) * sw + x) * 4)
    n += 2
  }
  for (let y = 1; y < sh - 1; y++) {
    sum += luma(y * sw * 4)
    sum += luma((y * sw + sw - 1) * 4)
    n += 2
  }
  const bg = sum / n

  // Foreground is the opposite of background
  const isFg =
    bg > 128
      ? (i: number) => bg - luma(i) > 40 // dark content on bright background
      : (i: number) => luma(i) - bg > 40 // bright content on dark background

  let x0 = sw, y0 = sh, x1 = 0, y1 = 0
  let found = false
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (isFg((y * sw + x) * 4)) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        found = true
      }
    }
  }

  // Fallback: use 96% of image centered
  if (!found || x1 - x0 < sw * 0.1 || y1 - y0 < sh * 0.1) {
    const p = 0.02
    return {
      x: Math.round(img.naturalWidth * p),
      y: Math.round(img.naturalHeight * p),
      w: Math.round(img.naturalWidth * (1 - p * 2)),
      h: Math.round(img.naturalHeight * (1 - p * 2)),
    }
  }

  const pad = Math.round(8 / ratio)
  const nx = Math.max(0, Math.round(x0 / ratio) - pad)
  const ny = Math.max(0, Math.round(y0 / ratio) - pad)
  return {
    x: nx,
    y: ny,
    w: Math.min(img.naturalWidth - nx, Math.round((x1 - x0) / ratio) + pad * 2),
    h: Math.min(img.naturalHeight - ny, Math.round((y1 - y0) / ratio) + pad * 2),
  }
}

async function cropToFile(img: HTMLImageElement, crop: Rect, name: string): Promise<File> {
  const c = document.createElement("canvas")
  c.width = crop.w
  c.height = crop.h
  c.getContext("2d")!.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h)
  return new Promise((resolve) =>
    c.toBlob((blob) => resolve(new File([blob!], name, { type: "image/jpeg" })), "image/jpeg", 0.95)
  )
}

const pct = (n: number, total: number) => `${(n / total) * 100}%`

const HANDLES: [Handle, string][] = [
  ["tl", "-top-2.5 -left-2.5 cursor-nwse-resize"],
  ["t", "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-n-resize"],
  ["tr", "-top-2.5 -right-2.5 cursor-nesw-resize"],
  ["l", "top-1/2 -translate-y-1/2 -left-2.5 cursor-w-resize"],
  ["r", "top-1/2 -translate-y-1/2 -right-2.5 cursor-e-resize"],
  ["bl", "-bottom-2.5 -left-2.5 cursor-nesw-resize"],
  ["b", "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-s-resize"],
  ["br", "-bottom-2.5 -right-2.5 cursor-nwse-resize"],
]

export function ImageCropModal({ file, index, total, onConfirm, onSkip }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgUrl, setImgUrl] = useState("")
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 })
  const [crop, setCrop] = useState<Rect | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const dragRef = useRef<{ handle: Handle; startX: number; startY: number; startCrop: Rect } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImgUrl(url)
    setCrop(null)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const handleImgLoad = useCallback(() => {
    const img = imgRef.current!
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
    setCrop(detectBounds(img))
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, handle: Handle) => {
      if (!crop) return
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = { handle, startX: e.clientX, startY: e.clientY, startCrop: crop }
      setIsDragging(true)
    },
    [crop]
  )

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current || !containerRef.current) return
      const { handle, startX, startY, startCrop } = dragRef.current
      const rect = containerRef.current.getBoundingClientRect()
      const sx = naturalSize.w / rect.width
      const sy = naturalSize.h / rect.height
      const dx = (e.clientX - startX) * sx
      const dy = (e.clientY - startY) * sy
      const MIN = 40

      let { x, y, w, h } = startCrop
      if (handle === "move") {
        x = Math.max(0, Math.min(naturalSize.w - w, x + dx))
        y = Math.max(0, Math.min(naturalSize.h - h, y + dy))
      } else {
        if (handle.includes("l")) {
          const nx = Math.max(0, Math.min(x + w - MIN, x + dx))
          w += x - nx
          x = nx
        }
        if (handle.includes("r")) w = Math.max(MIN, Math.min(naturalSize.w - x, w + dx))
        if (handle.includes("t")) {
          const ny = Math.max(0, Math.min(y + h - MIN, y + dy))
          h += y - ny
          y = ny
        }
        if (handle.includes("b")) h = Math.max(MIN, Math.min(naturalSize.h - y, h + dy))
      }
      setCrop({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) })
    },
    [naturalSize]
  )

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
    setIsDragging(false)
  }, [])

  useEffect(() => {
    if (!isDragging) return
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [isDragging, handlePointerMove, handlePointerUp])

  const handleAutoDetect = useCallback(() => {
    if (imgRef.current) setCrop(detectBounds(imgRef.current))
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!crop || !imgRef.current) return
    setIsProcessing(true)
    const cropped = await cropToFile(imgRef.current, crop, file.name)
    onConfirm(cropped)
    setIsProcessing(false)
  }, [crop, file.name, onConfirm])

  if (!imgUrl) return null

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex flex-col items-center justify-center gap-4 p-4">
      <p className="text-white/70 text-sm">
        Recadrage — image {index + 1} / {total}
      </p>

      <div
        ref={containerRef}
        className="relative w-fit select-none"
        style={{ touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={imgUrl}
          alt="recadrage"
          onLoad={handleImgLoad}
          draggable={false}
          style={{ display: "block", maxHeight: "65vh", maxWidth: "min(90vw, 800px)", objectFit: "contain" }}
        />

        {crop && (
          <>
            {/* Darkened regions outside crop */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-0 right-0 bg-black/55" style={{ top: 0, height: pct(crop.y, naturalSize.h) }} />
              <div className="absolute left-0 right-0 bg-black/55" style={{ top: pct(crop.y + crop.h, naturalSize.h), bottom: 0 }} />
              <div
                className="absolute bg-black/55"
                style={{ top: pct(crop.y, naturalSize.h), height: pct(crop.h, naturalSize.h), left: 0, width: pct(crop.x, naturalSize.w) }}
              />
              <div
                className="absolute bg-black/55"
                style={{
                  top: pct(crop.y, naturalSize.h),
                  height: pct(crop.h, naturalSize.h),
                  right: 0,
                  width: pct(naturalSize.w - crop.x - crop.w, naturalSize.w),
                }}
              />
            </div>

            {/* Crop frame + handles */}
            <div
              className="absolute border border-white"
              style={{
                left: pct(crop.x, naturalSize.w),
                top: pct(crop.y, naturalSize.h),
                width: pct(crop.w, naturalSize.w),
                height: pct(crop.h, naturalSize.h),
              }}
            >
              {/* Rule-of-thirds grid */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 bottom-0 border-r border-white/20" style={{ left: "33.33%" }} />
                <div className="absolute top-0 bottom-0 border-r border-white/20" style={{ left: "66.66%" }} />
                <div className="absolute left-0 right-0 border-b border-white/20" style={{ top: "33.33%" }} />
                <div className="absolute left-0 right-0 border-b border-white/20" style={{ top: "66.66%" }} />
              </div>

              {/* Interior drag zone */}
              <div
                className="absolute inset-0 cursor-move"
                onPointerDown={(e) => handlePointerDown(e, "move")}
              />

              {/* Corner + edge handles */}
              {HANDLES.map(([h, cls]) => (
                <div
                  key={h}
                  className={`absolute w-5 h-5 bg-white rounded-full border border-black/30 shadow ${cls}`}
                  onPointerDown={(e) => handlePointerDown(e, h)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAutoDetect}
          className="bg-white/10 text-white border-white/30 hover:bg-white/20 hover:text-white"
        >
          <RotateCcw className="w-4 h-4 mr-1.5" />
          Auto-détecter
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onSkip}
          disabled={isProcessing}
          className="bg-white/10 text-white border-white/30 hover:bg-white/20 hover:text-white"
        >
          <SkipForward className="w-4 h-4 mr-1.5" />
          Passer
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={isProcessing || !crop}>
          <Check className="w-4 h-4 mr-1.5" />
          {isProcessing ? "Traitement…" : "Confirmer le recadrage"}
        </Button>
      </div>
    </div>
  )
}
