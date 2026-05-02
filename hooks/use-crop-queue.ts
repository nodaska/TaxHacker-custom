"use client"

import { useCallback, useRef, useState } from "react"

const isJpeg = (f: File) =>
  f.type === "image/jpeg" ||
  f.type === "image/jpg" ||
  f.name.toLowerCase().endsWith(".jpg") ||
  f.name.toLowerCase().endsWith(".jpeg")

type QueueState = { jpegs: File[]; index: number }

export function useCropQueue() {
  const [queue, setQueue] = useState<QueueState | null>(null)
  const othersRef = useRef<File[]>([])
  const processedRef = useRef<File[]>([])
  const onCompleteRef = useRef<((files: File[]) => void) | null>(null)

  const startQueue = useCallback((files: File[], onComplete: (files: File[]) => void) => {
    const jpegs = files.filter(isJpeg)
    const others = files.filter((f) => !isJpeg(f))

    if (jpegs.length === 0) {
      onComplete(files)
      return
    }

    othersRef.current = others
    processedRef.current = []
    onCompleteRef.current = onComplete
    setQueue({ jpegs, index: 0 })
  }, [])

  const advance = useCallback((processedFile: File) => {
    processedRef.current = [...processedRef.current, processedFile]
    setQueue((prev) => {
      if (!prev) return null
      const next = prev.index + 1
      if (next >= prev.jpegs.length) {
        const allFiles = [...othersRef.current, ...processedRef.current]
        setTimeout(() => onCompleteRef.current?.(allFiles), 0)
        return null
      }
      return { ...prev, index: next }
    })
  }, [])

  const confirmCurrent = useCallback((croppedFile: File) => advance(croppedFile), [advance])

  const skipCurrent = useCallback(() => {
    if (!queue) return
    advance(queue.jpegs[queue.index])
  }, [queue, advance])

  return {
    startQueue,
    confirmCurrent,
    skipCurrent,
    currentFile: queue?.jpegs[queue.index] ?? null,
    currentIndex: queue?.index ?? 0,
    totalFiles: queue?.jpegs.length ?? 0,
  }
}
